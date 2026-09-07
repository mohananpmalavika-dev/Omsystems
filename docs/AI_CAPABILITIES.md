# KRYPTOVISION / SENTINEL GRID — AI CAPABILITIES & LOCAL COMPUTER VISION SPECIFICATION

> **100% Free Open-Source Local Edge AI Analytics Specification**
> **Engines**: YOLOv8 ONNX Runtime, Native Hardware NVR IVS/AcuSense/SMD Ingestion, Local ANPR & Face Recognition
> **Operating Cost**: $0.00 / month (Zero External Paid Cloud AI Dependencies)
> **Version**: v1.0.0-rc.2

---

## 1. Executive Summary & Principles

Sentinel Grid delivers high-accuracy, low-latency computer vision and surveillance intelligence without relying on costly third-party cloud APIs (such as AWS Rekognition or Google Cloud Vision).

### Core Principles
1. **Zero Cloud AI Costs ($0.00 / Month)**: All neural network inference executes directly on branch edge appliances or local on-premise GPU/CPU workers.
2. **Privacy-Preserving & Air-Gapped**: Video frames, facial embeddings, and license plate crops never leave the customer's private network perimeter.
3. **No Fake Confidence**: Neural network confidence scores represent genuine softmax probabilities from local inference models. Confidence values are never fabricated, boosted, or clamped.
4. **Hybrid Edge + Hardware Ingestion**: Sentinel leverages both local YOLO models and onboard camera/NVR hardware AI (Hikvision AcuSense, Dahua SMD, CP PLUS IVS) to maximize hardware utilization and minimize CPU load.

---

## 2. Supported AI Analytics & Computer Vision Modules

\`\`\`mermaid
graph TD
    RTSP[RTSP Camera Video Stream] --> DECODE[Hardware Accelerated Video Decoder]
    DECODE --> FRAME[Frame Sampler: 5-10 FPS Keyframe Buffer]
    
    FRAME --> YOLOV8[Local YOLOv8 ONNX Model: Person/Vehicle/Object]
    FRAME --> TAMPER[Camera Tamper Engine: Defocus/Occlusion/Angle]
    FRAME --> ANPR[Local ANPR Engine: License Plate OCR]
    FRAME --> FACE[Local Face Engine: Embedding Vector Match]
    
    HW_EVENT[Onboard Camera AI: AcuSense / SMD / IVS] --> NORM[Normalized AI Event Ingestion]
    
    YOLOV8 --> SPATIAL[Spatial-Temporal Filter & Persistence Gate]
    TAMPER --> SPATIAL
    ANPR --> SPATIAL
    NORM --> SPATIAL
    
    SPATIAL --> INCIDENT[Incident Correlation & Real-Time Alert Dispatch]

    style RTSP fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#fff
    style YOLOV8 fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#fff
    style SPATIAL fill:#022c22,stroke:#10b981,stroke-width:2px,color:#fff
    style INCIDENT fill:#450a0a,stroke:#ef4444,stroke-width:2px,color:#fff
\`\`\`

### 2.1 Perimeter & Object Analytics
- **Polygonal Intrusion Detection**: SOC operators draw multi-point polygon zones on the camera view. When a detected object (person or vehicle) enters the boundary, a real-time event is triggered.
- **Directional Line Crossing (Virtual Tripwire)**: Monitors crossing events across virtual vectors with directional filtering (Left-to-Right, Right-to-Left, or Bidirectional).
- **Loitering & Dwell Thresholds**: Tracks object bounding boxes over time using Hungarian matching. Triggers an alert when an individual lingers in an ATM lobby or exterior corridor exceeding a configurable threshold (e.g., $> 120$ seconds).
- **Crowd Density & Occupancy**: Calculates bounding box area ratios and centroid densities to detect crowd formation in branch teller zones.

### 2.2 Camera Health & Tampering AI
- **Defocus Blur Detection**: Analyzes Laplacian gradient variance across the frame. When sharpness drops below baseline thresholds, a `CAMERA_DEFOCUS` alert is emitted.
- **Occlusion & Spray Paint Blinding**: Detects sudden histogram flattening and zero-texture states caused by bag placement, spray paint, or physical obstruction.
- **Camera Displacement / Angle Change**: Structural Similarity Index (SSIM) and optical flow analysis detect when a camera has been physically knocked or repositioned.

### 2.3 Specialized Banking & Financial Subsystems
- **Cash Vault Dual-Presence Enforcement**: Enforces the 4-Eyes rule inside currency vaults. Emits a P1 panic alert if only one person enters the vault or if an unauthorized entry occurs outside banking hours.
- **ATM Skimming & Fascia Tampering**: Monitored camera views of ATM card slots and keypads evaluate physical overlay anomalies.
- **Teller Cash Counter Compliance**: Supervised detection of cash bundles and transaction boundaries.

---

## 3. False-Positive Control & Anti-Flicker Architecture

Real-world surveillance environments suffer from insects, car headlights, heavy rain, and lighting flicker. Sentinel Grid employs a 4-stage false-positive filter:

1. **Spatial-Temporal Persistence Gating**: A candidate detection must persist in contiguous frame intervals ($N \ge 3$ consecutive frames within a sliding 500ms window) before being promoted to an event.
2. **Weather & Insect Suppression**: High-velocity, small-area bounding boxes (insects flying close to the IR illuminator) are filtered via aspect ratio and velocity vector analysis.
3. **Anti-Flicker Hysteresis State Machine**: Once an alarm state is entered, it remains active for a minimum hold-off time ($T_{\text{hold}} \ge 10\text{ seconds}$) preventing rapid toggling and operator alert fatigue.
4. **Day/Night IR Transition Blanking**: Suppresses transient motion events during the 2–3 second IR cut filter transition period.

---

## 4. Hardware Sizing & Model Profiles

| Model Profile | Neural Architecture | Quantization | Target Inference Hardware | Inference Latency | Channels Supported |
| :--- | :--- | :---: | :--- | :---: | :---: |
| **YOLO_V8_NANO** | YOLOv8n (Detection) | INT8 / FP16 | Intel NUC / Modern x86 CPU | $\approx 22\text{ ms}$ | Up to 8 streams @ 5 FPS |
| **YOLO_V8_SMALL** | YOLOv8s (Multi-Class)| FP16 | NVIDIA Jetson Orin / GTX 1650 | $\approx 12\text{ ms}$ | Up to 16 streams @ 10 FPS |
| **ONBOARD_NATIVE**| AcuSense / SMD / IVS | On-Chip ASIC | Zero Central CPU Load | $< 1\text{ ms}$ | Unlimited (Offloaded to NVR) |
| **LOCAL_ANPR** | CRNN + LPRNet | FP32 / INT8 | Edge Host CPU | $\approx 35\text{ ms}$ | Event-triggered crop |
| **LOCAL_FACE** | MobileFaceNet / ArcFace| FP16 / INT8 | Edge Host CPU | $\approx 18\text{ ms}$ | Event-triggered crop |

---

## 5. Verification & Automated Test Suites

The entire 100% free local AI pipeline is validated by automated integration tests:
\`\`\`bash
# Run standalone local AI pipeline verification
npm run test:local:ai
\`\`\`
- Verified: Zero monthly cloud costs ($0.00).
- Verified: Zero external paid API endpoints in production codepaths.
- Verified: Full detection event normalization across Hikvision AcuSense, Dahua SMD, CP PLUS IVS, and local YOLOv8 ONNX models.
