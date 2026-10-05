"""Orchestrate: Stage1 (track motorcycles+riders) → Stage2 (helmet) → Plate (if violation).

Adds:
  - Track history per ID
  - Temporal smoothing: violation only fires after N=3 consecutive no_helmet frames
  - Per-track cooldown: don't re-fire same track within COOLDOWN_SEC
  - Garbage-collect dead tracks (not seen in 30s)
"""
from typing import List, Dict, Any
import time
import numpy as np
import cv2
from collections import deque

from .stage1 import MotorcycleDetector
from .stage2 import HelmetClassifier
from .plate import PlateRecognizer
from .. import config


COLOR_HELMET = (0, 200, 0)
COLOR_NO_HELMET = (0, 0, 255)
COLOR_OTHER = (200, 200, 200)
COLOR_WATCHING = (0, 165, 255)   # orange — pre-violation

CONSECUTIVE_NEEDED = 3        # frames in a row with no_helmet
HISTORY_LEN = 6
COOLDOWN_SEC = 10.0           # don't re-fire same track within this
TRACK_GC_SEC = 30.0           # forget tracks not seen for 30s


class HelmetPipeline:
    def __init__(self, with_plate: bool = True):
        self.s1 = MotorcycleDetector()
        self.s2 = HelmetClassifier()
        self.plate = PlateRecognizer() if with_plate else None
        self.with_plate = with_plate
        self.last_inf_ms = 0.0
        self.last_stage1_ms = 0.0
        self.last_stage2_ms = 0.0
        self.last_plate_ms = 0.0
        # Per-track state
        self.track_history: Dict[int, deque] = {}
        self.track_last_seen: Dict[int, float] = {}
        self.track_last_fired: Dict[int, float] = {}

    def _gc_tracks(self):
        now = time.time()
        dead = [tid for tid, t in self.track_last_seen.items() if now - t > TRACK_GC_SEC]
        for tid in dead:
            self.track_history.pop(tid, None)
            self.track_last_seen.pop(tid, None)
            self.track_last_fired.pop(tid, None)

    def process(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        h, w = frame.shape[:2]
        t0 = time.time()
        groups = self.s1.detect(frame)
        t1 = time.time()
        self.last_stage1_ms = (t1 - t0) * 1000

        if not groups:
            self.last_stage2_ms = self.last_plate_ms = 0
            self.last_inf_ms = self.last_stage1_ms
            self._gc_tracks()
            return []

        # Stage 2 batched
        crops = []
        for g in groups:
            cx1, cy1, cx2, cy2 = g['crop_box']
            crops.append(frame[cy1:cy2, cx1:cx2])
        t2a = time.time()
        labels = self.s2.classify(crops)
        t2b = time.time()
        self.last_stage2_ms = (t2b - t2a) * 1000

        now = time.time()
        plate_t0 = time.time()
        dets = []
        for g, crop, (label, conf) in zip(groups, crops, labels):
            tid = g.get('track_id')
            # Update history
            if tid is not None:
                self.track_last_seen[tid] = now
                hist = self.track_history.setdefault(tid, deque(maxlen=HISTORY_LEN))
                hist.append((label, conf))

            # Temporal smoothing: confirmed violation only if last N are all no_helmet ≥ threshold
            confirmed = False
            recent_nh = 0
            if tid is not None:
                hist = self.track_history[tid]
                if len(hist) >= CONSECUTIVE_NEEDED:
                    last_n = list(hist)[-CONSECUTIVE_NEEDED:]
                    confirmed = all(
                        lab == 'no_helmet' and c >= config.STAGE2_VIOLATION_CONF
                        for lab, c in last_n
                    )
                # also count recent no_helmet for "watching" UI hint
                recent_nh = sum(
                    1 for lab, c in hist
                    if lab == 'no_helmet' and c >= config.STAGE2_VIOLATION_CONF
                )

            # Cooldown: don't emit same track twice within window
            should_fire = False
            if confirmed and tid is not None:
                last_fired = self.track_last_fired.get(tid, 0.0)
                if now - last_fired >= COOLDOWN_SEC:
                    should_fire = True
                    self.track_last_fired[tid] = now

            d = {
                **g,
                'helmet_label': label,
                'helmet_conf': conf,
                'is_violation': should_fire,         # only fires on confirmation + cooldown
                'is_watching': (recent_nh > 0 and not should_fire),
                'recent_nh': recent_nh,
            }
            # Plate only on confirmed violation
            if should_fire and self.plate is not None and crop.size > 0:
                pres = self.plate.process(crop)
                d.update(pres)
            dets.append(d)

        self.last_plate_ms = (time.time() - plate_t0) * 1000
        self.last_inf_ms = (time.time() - t0) * 1000
        # Periodic gc
        if int(now) % 5 == 0:
            self._gc_tracks()
        return dets

    def annotate(self, frame: np.ndarray, dets: List[Dict[str, Any]]) -> np.ndarray:
        for d in dets:
            cx1, cy1, cx2, cy2 = d['crop_box']
            if d['is_violation']:
                color = COLOR_NO_HELMET; thick = 3
            elif d['is_watching']:
                color = COLOR_WATCHING; thick = 2
            elif d['helmet_label'] == 'helmet':
                color = COLOR_HELMET; thick = 2
            else:
                color = COLOR_OTHER; thick = 1
            cv2.rectangle(frame, (cx1, cy1), (cx2, cy2), color, thick)
            tid = d.get('track_id')
            id_tag = f"#{tid}" if tid is not None else ""
            text = f"{id_tag} {d['helmet_label']} {d['helmet_conf']:.2f}"
            if d.get('plate_text'):
                text += f" | {d['plate_text']}"
            (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            cv2.rectangle(frame, (cx1, max(0, cy1-th-8)), (cx1+tw+6, cy1), color, -1)
            cv2.putText(frame, text, (cx1+3, cy1-4), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                        (255, 255, 255), 2)
            if d.get('plate_box'):
                px1, py1, px2, py2 = d['plate_box']
                cv2.rectangle(frame, (cx1+px1, cy1+py1), (cx1+px2, cy1+py2),
                              (255, 200, 0), 2)
        return frame
