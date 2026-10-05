"""Train Stage-2 helmet classifier v5.

Data: /home/azureuser/helmet_v5/data/train/
Arch: EfficientNet-B0, binary {helmet, no_helmet}
Split: camera-stratified (from labels.db `split` column)

Outputs:
  /home/azureuser/helmet_v5/models/helmet_v5.pt
  /home/azureuser/helmet_v5/models/helmet_v5.onnx
  /home/azureuser/helmet_v5/models/train_log.json
"""
import os, sqlite3, argparse, random, json, time
from collections import Counter
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
from torchvision import transforms, models
from PIL import Image

ROOT = Path('/home/azureuser/helmet_v5')
# Paths set by main() from --data / --tag flags.
DATA = ROOT / 'data' / 'train'
DB   = DATA / 'labels.db'
IMGS = DATA / 'imgs'
OUT  = ROOT / 'models'; OUT.mkdir(parents=True, exist_ok=True)

LABELS = ['helmet', 'no_helmet']
LBL2ID = {l: i for i, l in enumerate(LABELS)}


def load_rows():
    db = sqlite3.connect(DB)
    train = db.execute("SELECT filename, label FROM labels WHERE split='train'").fetchall()
    val   = db.execute("SELECT filename, label FROM labels WHERE split='val'").fetchall()
    return train, val


class DS(Dataset):
    def __init__(self, rows, tfm):
        self.rows = rows
        self.tfm = tfm

    def __len__(self): return len(self.rows)

    def __getitem__(self, i):
        fn, lab = self.rows[i]
        img = Image.open(IMGS / fn).convert('RGB')
        return self.tfm(img), LBL2ID[lab]


def build_model():
    m = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.IMAGENET1K_V1)
    in_feat = m.classifier[1].in_features
    m.classifier[1] = nn.Linear(in_feat, len(LABELS))
    return m


def evaluate(model, loader, device):
    model.eval()
    ok = tot = 0
    per_cls = {i: [0, 0] for i in range(len(LABELS))}  # [correct, total] per class
    with torch.no_grad():
        for x, y in loader:
            x, y = x.to(device, non_blocking=True), y.to(device)
            with torch.amp.autocast('cuda', dtype=torch.float16):
                logits = model(x)
            pred = logits.argmax(1)
            tot += y.size(0)
            ok += (pred == y).sum().item()
            for i in range(len(LABELS)):
                mask = (y == i)
                per_cls[i][0] += (pred[mask] == i).sum().item()
                per_cls[i][1] += mask.sum().item()
    acc = ok / max(tot, 1)
    cls_acc = {LABELS[i]: (c / max(t, 1), t) for i, (c, t) in per_cls.items()}
    return acc, cls_acc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--epochs', type=int, default=30)
    ap.add_argument('--batch', type=int, default=128)
    ap.add_argument('--lr', type=float, default=3e-4)
    ap.add_argument('--wd', type=float, default=1e-4)
    ap.add_argument('--img-size', type=int, default=224)
    ap.add_argument('--seed', type=int, default=42)
    ap.add_argument('--data', default=str(DATA), help='dataset dir (contains labels.db + imgs/)')
    ap.add_argument('--tag', default='v5', help='checkpoint suffix (helmet_{tag}.pt)')
    args = ap.parse_args()

    global DB, IMGS
    DATA_DIR = Path(args.data)
    DB   = DATA_DIR / 'labels.db'
    IMGS = DATA_DIR / 'imgs'

    torch.manual_seed(args.seed); np.random.seed(args.seed); random.seed(args.seed)
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f'device: {device}')

    train_rows, val_rows = load_rows()
    print(f'train={len(train_rows)} val={len(val_rows)}')
    print(f'train class dist: {Counter(l for _, l in train_rows)}')
    print(f'val   class dist: {Counter(l for _, l in val_rows)}')

    tfm_train = transforms.Compose([
        transforms.Resize((args.img_size + 16, args.img_size + 16)),
        transforms.RandomCrop(args.img_size),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(0.2, 0.2, 0.2, 0.05),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        transforms.RandomErasing(p=0.25, scale=(0.02, 0.15)),
    ])
    tfm_val = transforms.Compose([
        transforms.Resize((args.img_size, args.img_size)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    train_ds = DS(train_rows, tfm_train)
    val_ds   = DS(val_rows,   tfm_val)

    # Weighted sampler for balance
    train_labels = [LBL2ID[l] for _, l in train_rows]
    cls_counts = Counter(train_labels)
    weights = [1.0 / cls_counts[l] for l in train_labels]
    sampler = WeightedRandomSampler(weights, num_samples=len(train_labels), replacement=True)
    train_loader = DataLoader(train_ds, batch_size=args.batch, sampler=sampler,
                              num_workers=6, pin_memory=True, persistent_workers=True)
    val_loader   = DataLoader(val_ds, batch_size=args.batch, shuffle=False,
                              num_workers=4, pin_memory=True)

    model = build_model().to(device)
    # Class-weight CE to further counter imbalance
    cw = torch.tensor([1.0 / cls_counts[i] for i in range(len(LABELS))], dtype=torch.float32)
    cw = cw / cw.sum() * len(LABELS)
    crit = nn.CrossEntropyLoss(weight=cw.to(device))
    opt  = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.wd)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)
    scaler = torch.amp.GradScaler('cuda')

    best_val = 0.0
    log = []
    ckpt_path = OUT / f'helmet_{args.tag}.pt'
    for ep in range(args.epochs):
        model.train()
        t0 = time.time(); loss_sum = 0.0; n = 0
        for x, y in train_loader:
            x, y = x.to(device, non_blocking=True), y.to(device)
            opt.zero_grad(set_to_none=True)
            with torch.amp.autocast('cuda', dtype=torch.float16):
                logits = model(x); loss = crit(logits, y)
            scaler.scale(loss).backward()
            scaler.step(opt); scaler.update()
            loss_sum += loss.item() * y.size(0); n += y.size(0)
        sched.step()
        tl = loss_sum / max(n, 1)
        val_acc, cls_acc = evaluate(model, val_loader, device)
        dt = time.time() - t0
        row = {'epoch': ep + 1, 'train_loss': tl, 'val_acc': val_acc,
               'cls_acc': {k: v[0] for k, v in cls_acc.items()},
               'lr': sched.get_last_lr()[0], 'sec': dt}
        log.append(row)
        print(f'ep {ep+1:02d}/{args.epochs}  tl={tl:.4f}  val={val_acc:.4f}  '
              f"helmet={cls_acc['helmet'][0]:.3f}  no_helmet={cls_acc['no_helmet'][0]:.3f}  "
              f"lr={sched.get_last_lr()[0]:.2e}  {dt:.1f}s")
        if val_acc > best_val:
            best_val = val_acc
            torch.save({'state_dict': model.state_dict(), 'labels': LABELS,
                        'val_acc': val_acc, 'cls_acc': {k: v[0] for k, v in cls_acc.items()}},
                       ckpt_path)
    (OUT / 'train_log.json').write_text(json.dumps(log, indent=2))
    print(f'[best] val_acc={best_val:.4f}  saved to {ckpt_path}')

    # Export ONNX
    model.load_state_dict(torch.load(ckpt_path)['state_dict'])
    model.eval()
    dummy = torch.randn(1, 3, args.img_size, args.img_size, device=device)
    onnx_path = OUT / f'helmet_{args.tag}.onnx'
    torch.onnx.export(model, dummy, str(onnx_path),
                      input_names=['input'], output_names=['logits'],
                      dynamic_axes={'input': {0: 'N'}, 'logits': {0: 'N'}},
                      opset_version=17)
    print(f'[onnx] {onnx_path} ({onnx_path.stat().st_size/1024/1024:.1f} MB)')


if __name__ == '__main__':
    main()
