"""Stage 2 — helmet classifier (EfficientNet-B0 v4)."""
from typing import List, Tuple
import numpy as np
import cv2
import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image

from .. import config


class HelmetClassifier:
    def __init__(self):
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        ckpt = torch.load(config.HELMET_CLASSIFIER, map_location=device, weights_only=False)
        self.labels = ckpt['labels']
        m = models.efficientnet_b0(weights=None)
        m.classifier[1] = nn.Linear(m.classifier[1].in_features, len(self.labels))
        m.load_state_dict(ckpt['model'])
        m.eval().to(device)
        if device == 'cuda':
            m = m.half()
        self.model = m
        self.device = device
        self.tfm = transforms.Compose([
            transforms.Resize((config.STAGE2_INPUT_SIZE, config.STAGE2_INPUT_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])

    def classify(self, crops: List[np.ndarray]) -> List[Tuple[str, float]]:
        if not crops:
            return []
        tens = []
        for c in crops:
            if c.size == 0:
                tens.append(None); continue
            rgb = cv2.cvtColor(c, cv2.COLOR_BGR2RGB)
            tens.append(self.tfm(Image.fromarray(rgb)))
        valid = [i for i, t in enumerate(tens) if t is not None]
        if not valid:
            return [('?', 0.0)] * len(crops)
        batch = torch.stack([tens[i] for i in valid]).to(self.device)
        if self.device == 'cuda':
            batch = batch.half()
        with torch.no_grad():
            probs = torch.softmax(self.model(batch).float(), dim=1).cpu().numpy()
        out = [('?', 0.0)] * len(crops)
        for j, i in enumerate(valid):
            idx = int(probs[j].argmax())
            out[i] = (self.labels[idx], float(probs[j][idx]))
        return out
