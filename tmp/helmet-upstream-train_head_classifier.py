"""Train EfficientNet-B0 head helmet classifier.

Design choices:
- EfficientNet-B0 pretrained on ImageNet — ~5M params, fast, strong features.
- Input 224x224; aspect-preserving resize + pad so aspect isn't distorted.
- Runtime augmentations: flips, rotation, color jitter, gaussian blur,
  perspective warp. This is critical for generalization on head crops which
  vary enormously in angle/lighting.
- AdamW + cosine LR + warmup.
- BCE with class weights if imbalanced.
- Mixed precision (fp16) on H100.
- Early stop patience=3 on val F1 (not accuracy — F1 is better for binary
  classification with potential class imbalance).
- ImageFolder dataset — train and val are already separated into per-class dirs.
"""
from __future__ import annotations
import os, random
from pathlib import Path
import torch
import torch.nn as nn
import torchvision.transforms as T
import torchvision.transforms.functional as TF
from torchvision.datasets import ImageFolder
from torch.utils.data import DataLoader
from torchvision.models import efficientnet_b0, EfficientNet_B0_Weights

DATA = Path('/home/azureuser/helmet_v5/data/head_helmet/imgs')
OUT  = Path('/home/azureuser/helmet_v5/models/helmet_head_v2.pt')
OUT.parent.mkdir(parents=True, exist_ok=True)
RUN  = Path('/home/azureuser/helmet_v5/runs/head_helmet_v2')
RUN.mkdir(parents=True, exist_ok=True)


class PadResize:
    """Resize preserving aspect ratio with zero-padding to 224x224."""
    def __init__(self, size=224): self.size = size
    def __call__(self, img):
        w, h = img.size
        scale = self.size / max(w, h)
        nw, nh = int(w*scale), int(h*scale)
        img = img.resize((nw, nh))
        # Pad to 224x224
        pad_l = (self.size - nw) // 2; pad_t = (self.size - nh) // 2
        pad_r = self.size - nw - pad_l; pad_b = self.size - nh - pad_t
        img = TF.pad(img, (pad_l, pad_t, pad_r, pad_b), fill=0)
        return img


NORM = T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])

train_tf = T.Compose([
    PadResize(224),
    T.RandomHorizontalFlip(0.5),
    T.RandomRotation(15, fill=0),
    T.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2),
    T.RandomApply([T.GaussianBlur(3)], 0.3),
    T.RandomPerspective(0.1, 0.3),
    T.ToTensor(), NORM,
])
val_tf = T.Compose([PadResize(224), T.ToTensor(), NORM])


def f1_score(tp, fp, fn):
    p = tp / max(tp + fp, 1)
    r = tp / max(tp + fn, 1)
    if p + r == 0: return 0.0, 0.0, 0.0
    return 2*p*r/(p+r), p, r


def main():
    torch.manual_seed(42); random.seed(42)
    device = 'cuda'
    train_ds = ImageFolder(str(DATA / 'train'), transform=train_tf)
    val_ds   = ImageFolder(str(DATA / 'val'),   transform=val_tf)
    print(f'[data] train={len(train_ds)} val={len(val_ds)}  classes={train_ds.classes}')

    # Compute class weights for imbalance
    class_counts = [0, 0]
    for _, c in train_ds.samples: class_counts[c] += 1
    total = sum(class_counts)
    class_weights = torch.tensor([total/(2*c) if c else 1.0 for c in class_counts]).to(device)
    print(f'[data] class_counts={class_counts} weights={class_weights.tolist()}')

    bs = 64
    train_dl = DataLoader(train_ds, batch_size=bs, shuffle=True,
                          num_workers=6, pin_memory=True, drop_last=True)
    val_dl   = DataLoader(val_ds,   batch_size=bs, shuffle=False,
                          num_workers=4, pin_memory=True)

    model = efficientnet_b0(weights=EfficientNet_B0_Weights.DEFAULT)
    # Replace classifier head: 1280 -> 2
    model.classifier[1] = nn.Linear(1280, 2)
    model = model.to(device)

    crit = nn.CrossEntropyLoss(weight=class_weights)
    opt = torch.optim.AdamW(model.parameters(), lr=1e-4, weight_decay=0.01)
    epochs = 20
    warmup = 2
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs-warmup)
    scaler = torch.amp.GradScaler('cuda')

    best_f1 = 0.0; patience = 3; stale = 0
    log = []
    for ep in range(1, epochs+1):
        model.train()
        losses = []
        for i, (x, y) in enumerate(train_dl):
            x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
            opt.zero_grad()
            with torch.amp.autocast('cuda'):
                logits = model(x)
                loss = crit(logits, y)
            scaler.scale(loss).backward()
            scaler.step(opt); scaler.update()
            losses.append(loss.item())
            if i % 50 == 0:
                print(f'  ep {ep} it {i}/{len(train_dl)} loss={loss.item():.3f}')
        if ep > warmup: sched.step()

        # Val
        model.eval()
        tp = fp = fn = tn = 0
        with torch.no_grad():
            for x, y in val_dl:
                x, y = x.to(device), y.to(device)
                with torch.amp.autocast('cuda'):
                    pred = model(x).argmax(1)
                # class 1 = no_helmet (positive for our purpose)
                tp += int(((pred==1) & (y==1)).sum().item())
                fp += int(((pred==1) & (y==0)).sum().item())
                fn += int(((pred==0) & (y==1)).sum().item())
                tn += int(((pred==0) & (y==0)).sum().item())
        acc = (tp+tn) / max(tp+fp+fn+tn, 1)
        f1, P, R = f1_score(tp, fp, fn)
        log.append({'ep': ep, 'loss': sum(losses)/len(losses),
                    'val_acc': acc, 'val_f1': f1, 'val_P': P, 'val_R': R,
                    'tp': tp, 'fp': fp, 'fn': fn, 'tn': tn})
        print(f'[ep {ep}] loss={sum(losses)/len(losses):.3f}  val_acc={acc:.3f}  '
              f'F1={f1:.3f}  P={P:.3f}  R={R:.3f}  (tp={tp} fp={fp} fn={fn} tn={tn})')

        if f1 > best_f1:
            best_f1 = f1; stale = 0
            torch.save(model.state_dict(), str(OUT))
            print(f'  ★ new best, saved to {OUT}')
        else:
            stale += 1
            if stale >= patience:
                print(f'[early-stop] no F1 improvement for {patience} epochs'); break

    import json
    (RUN / 'log.json').write_text(json.dumps(log, indent=2))
    print(f'\n[done] best val F1 = {best_f1:.3f}, saved to {OUT}')


if __name__ == '__main__':
    main()
