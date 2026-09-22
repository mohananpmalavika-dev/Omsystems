# Sentinel Grid: AI Architecture & Pluggable Inference Pipeline

**Document Version:** 1.0.0-PROD  
**Component:** Analytics Engine & Pluggable Model Runtime  
**Hardware Support:** Hybrid CPU (Intel/AMD AVX-512) & GPU (NVIDIA CUDA / TensorRT)  

---

## 1. Pluggable Inference Pipeline Overview

Sentinel Grid separates AI business logic from deep learning model execution using an adapter-based architecture. Models can be upgraded, swapped, or dynamically assigned per camera profile without modifying upstream alert, recording, or incident workflows.

```
+-----------------------------------------------------------------------------------------------+
|                                    AI INFERENCE PIPELINE                                      |
|                                                                                               |
|  +-----------------+     +-----------------+     +-----------------+     +-----------------+  |
|  | Stream Demuxer  | --> | Frame Sampler   | --> | Preprocessor    | --> | Model Adapter   |  |
|  | RTSP / HLS      |     | (Adaptive Rate) |     | (Resize/Letter) |     | (ONNX Runtime)  |  |
|  +-----------------+     +-----------------+     +-----------------+     +--------+--------+  |
|                                                                                   |           |
|                                                                                   v           |
|  +-----------------+     +-----------------+     +-----------------+     +--------+--------+  |
|  | Evidence Vault  | <-- | Incident Engine | <-- | Risk Evaluator  | <-- | Object Tracker  |  |
|  | Forensic Clips  |     | P1-P4 Alerter   |     | Banking Rules   |     | (ByteTrack)     |  |
|  +-----------------+     +-----------------+     +-----------------+     +-----------------+  |
+-----------------------------------------------------------------------------------------------+
```

---

## 2. Pluggable Model Decoders

The runtime supports multi-format decoders implemented in `analytics-engine/src/inference/yolo-detection-inference.ts`:

1. **YOLOv8 Decoder (`yolov8`):** Tensor output `[1, 84, 8400]` with direct bounding box `[cx, cy, w, h]` and class probabilities.
2. **YOLOv5 Decoder (`yolov5`):** Tensor output `[1, 25200, 85]` with explicit objectness score multiplier.
3. **YOLOX Decoder (`yolox`):** Decoupled head decoder with letterbox BGR pre-processing.
4. **XYXY Raw Decoder (`xyxy`):** Optimized for specialized models exporting non-normalized `[x1, y1, x2, y2]` coordinates.

---

## 3. Strict Anti-Simulation Contract

In accordance with Sentinel Grid production truth guidelines:
- **No Mock Confidence:** When an ONNX session or GPU device is uninitialized, the engine strictly reports:
  ```json
  {
    "status": "DEPENDENCY_UNAVAILABLE",
    "provenance": "LIVE_INFERENCE",
    "confidence": null,
    "reason": "Model weights unmounted or CUDA runtime offline"
  }
  ```
- **Explainable Classifications:** Every AI event is tagged with one of 4 strict legal evidence classifications:
  - `OBSERVATION`: Ambient detection without rule breach.
  - `INDICATOR`: Anomalous activity requiring passive tally.
  - `ALERT`: Rule violation requiring operator dispatch.
  - `INVESTIGATION LEAD`: Forensic match or access mismatch for post-incident review.

---

## 4. Adaptive Resource Management & Scheduling

Sentinel Grid avoids processing all 4,000+ cameras at 30 FPS simultaneously:

1. **Tiered Camera Priority:**
   - **P1 Critical Cameras (Vault, Cash Counter, Currency Chest):** 10–15 FPS continuous inference.
   - **P2 Secondary Cameras (Customer Area, Branch Entry):** 3–5 FPS continuous inference.
   - **P3 Static Cameras (Perimeter, Parking):** 1 FPS baseline, bursting to 10 FPS upon motion trigger.
2. **Dynamic Frame Skipping:** Inference queues drop stale frames when GPU tensor execution latency exceeds 150ms, guaranteeing real-time alert dispatch without backlog lag.
