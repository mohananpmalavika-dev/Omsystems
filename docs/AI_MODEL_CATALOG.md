# Sentinel Grid / KryptoVision — AI Model Provenance Catalog

> **Standard**: Directive Section 7 (Model Provenance & Permissive Licensing)  
> **Operational Guarantee**: 100% Open-Source Local Execution | Zero Paid Cloud AI Dependencies ($0.00/mo)  
> **Status**: AUTHORITATIVE MODEL CATALOG

---

## 1. Overview & Verification Standards

Every production AI model deployed in Sentinel Grid satisfies the following invariants:
1. **Permissive Open-Source License**: Apache License 2.0 or MIT License. Zero copyleft (GPL/AGPL) contamination.
2. **Cryptographic Checksum Verification**: Every model artifact is verified with SHA-256 before loading into ONNX Runtime. Corrupted or mismatched weights fail immediately (`MODEL_UNAVAILABLE`).
3. **Deterministic Pre/Post-Processing**: Color space (RGB24), normalization tensors, NMS (Non-Maximum Suppression) thresholds, and IOU calculations are fully documented.
4. **Transparent Hardware Target**: Runs locally on x86_64 / ARM64 CPU or local Intel/NVIDIA/Qualcomm NPU/GPU without external network calls.

---

## 2. Production Model Catalog

### 2.1 YOLOX Tiny (COCO Object & Vehicle Detector)
- **Primary Task**: General object detection, person detection, vehicle identification (car, bus, truck, motorcycle, bicycle).
- **Upstream Repository**: [Megvii YOLOX](https://github.com/Megvii-BaseDetection/YOLOX)
- **Artifact**: Official `0.1.1rc0` `yolox_tiny.onnx` release asset
- **License**: Apache License 2.0
- **SHA-256 Checksum**: `427cc366d34e27ff7a03e2899b5e3671425c262ea2291f88bb942bc1cc70b0f7`
- **Input Resolution**: `416 x 416 x 3` (RGB, Normalized float32 `[0.0, 1.0]`)
- **Output Tensors**: `[1, 3549, 85]` (Bounding boxes, objectness, 80 COCO class probabilities)
- **Benchmark Performance**:
  - CPU Latency (Intel Core i7 / Xeon): **28–34 ms**
  - Inference Throughput: **8.5 FPS per camera stream**
  - mAP (COCO val2017): **32.8%**

### 2.2 OpenCV Zoo YuNet (Face Detector)
- **Primary Task**: Multi-scale face detection, 5-point facial landmark alignment (eyes, nose, mouth corners).
- **Upstream Repository**: [OpenCV Zoo YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet)
- **Artifact**: `face_detection_yunet_2023mar.onnx`
- **License**: MIT License
- **SHA-256 Checksum**: `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`
- **Input Resolution**: Dynamic (`320 x 320` to `640 x 640`, BGR / RGB float32)
- **Output Tensors**: `[N, 15]` (`[x, y, w, h, x_re, y_re, x_le, y_le, x_nt, y_nt, x_rc, y_rc, x_lc, y_lc, score]`)
- **Benchmark Performance**:
  - CPU Latency: **12–18 ms**
  - Detection Range: Up to 15 meters on 1080p CCTV feeds
  - WIDER Face Validation (Easy / Medium / Hard): **89.5% / 87.1% / 75.3%**

### 2.3 OpenCV Zoo SFace (Biometric Facial Embedding)
- **Primary Task**: 512-dimension unit vector feature extraction for watchlist and access verification.
- **Upstream Repository**: [OpenCV Zoo SFace](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface)
- **Artifact**: `face_recognition_sface_2021dec_int8.onnx`
- **License**: Apache License 2.0
- **SHA-256 Checksum**: `2b0e941e6f16cc048c20aee0c8e31f569118f65d702914540f7bfdc14048d78a`
- **Input Resolution**: `112 x 112 x 3` (Aligned facial crop via YuNet 5 landmarks)
- **Output Vector**: `[1, 512]` normalized unit vector (L2 norm = 1.0)
- **Matching Metric**: Cosine Similarity ($\ge 0.82$ for positive match, $\ge 0.90$ for high confidence)
- **Accuracy (LFW Benchmark)**: **99.40%**

### 2.4 OpenCV Zoo LPD-YuNet (License Plate Localization)
- **Primary Task**: Vehicle license plate detection and 4-corner perspective quad extraction.
- **Upstream Repository**: [OpenCV Zoo LPD-YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/license_plate_detection_yunet)
- **Artifact**: `license_plate_detection_lpd_yunet_2023mar.onnx`
- **License**: Apache License 2.0
- **SHA-256 Checksum**: `6d4978a7b6d25514d5e24811b82bfb511d166bdd8ca3b03aa63c1623d4d039c7`
- **Input Resolution**: Dynamic (`320 x 320` to `640 x 640`)
- **Output Tensors**: `[N, 14]` (Bounding quad coordinates and detection confidence)
- **Latency**: **14–20 ms** on CPU

### 2.5 OpenCV Zoo CRNN (Text Recognition & Plate OCR)
- **Primary Task**: Sequence recognition of alphanumeric license plate text (Indian state codes, series, numbers).
- **Upstream Repository**: [OpenCV Zoo CRNN](https://github.com/opencv/opencv_zoo/tree/main/models/text_recognition_crnn)
- **Artifact**: `text_recognition_CRNN_EN_2022oct_int8.onnx`
- **License**: Apache License 2.0
- **SHA-256 Checksum**: `94117b4c2652337b3f1aef81b2ec15a74e97973b1c58f743e86380b95b95ffa2`
- **Input Resolution**: `32 x 100 x 1` (Grayscale cropped plate image)
- **Output Vocabulary**: `[0-9, A-Z]` CTC greedy decoder
- **Post-Processing**: Indian RTO syntax validator (2 letters state code + 2 digits district + series + 4 digits)

### 2.6 PaddleClas PULC Safety Helmet (PPE Compliance)
- **Primary Task**: Workplace and branch safety compliance (wearing helmet vs unwearing helmet).
- **Upstream Repository**: [PaddleClas PULC](https://github.com/PaddlePaddle/PaddleClas/blob/release/2.6/docs/en/PULC/PULC_safety_helmet_en.md)
- **Artifact**: `pulc_safety_helmet.onnx` (Converted via official Paddle2ONNX 1.2.6)
- **License**: Apache License 2.0
- **Source Archive SHA-256**: `6e7cff9c4e3f3966b1d964c7f27c47577d9b31d725a4c8b625e68cb9affdcaa7`
- **Converted ONNX SHA-256**: `8c87834e2fde4eb29723483cdecedf78c231cf7e6da9913cf8227ba542b3f31f`
- **Input Resolution**: `224 x 224 x 3` (Upper torso / head crop from YOLOX person detector)
- **Classes**: `[wearing_helmet, unwearing_helmet]`
- **Inference Latency**: **12 ms** on CPU
