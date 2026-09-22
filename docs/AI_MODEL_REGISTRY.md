# Sentinel Grid: AI Model Registry & Catalog

**Document Version:** 1.0.0-PROD  
**Component:** Analytics Engine Model Governance  
**Registry File:** `analytics-engine/capability-registry.json`  

---

## 1. Registered Production AI Models

| Model Identifier | Provider / Architecture | Task | Classes | Minimum Compute | SHA-256 Checksum | Lifecycle Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **`yolov8n-security-base`** | Ultralytics / ONNX | Object Detection | Person, Bag, Backpack, Phone | 2 CPU Cores / 512MB RAM | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4` | **ACTIVE** |
| **`yolov8s-vehicle-anpr`** | Ultralytics / ONNX | Vehicle & Plate | Car, Truck, Bus, Motorcycle | 4 CPU Cores / 1GB VRAM | `4a8f901b2c4e6a8d0f1e3b5a7c9d0e2f1a3b4c5d` | **ACTIVE** |
| **`yolov8-banking-teller`** | Custom Fine-Tuned ONNX | Teller & Counter | Teller, Customer, Cash Tray | 4 CPU Cores / 1GB VRAM | `7b9e0f1a2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f` | **ACTIVE** |
| **`fast-reid-resnet50`** | FastReID / ONNX | Person Re-ID | 512-dim Embedding | 2GB VRAM / CUDA | `9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e` | **ACTIVE** |
| **`paddleocr-indian-plates`**| PaddleOCR / ONNX | License Plate OCR | Standard Indian Fonts | 2 CPU Cores / 512MB RAM | `3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d` | **ACTIVE** |
| **`yolov8-fire-smoke-v2`** | Fine-Tuned ONNX | Fire & Smoke | Flame, Dense Smoke | 2 CPU Cores / 1GB VRAM | `1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b` | **ACTIVE** |

---

## 2. Model Governance Lifecycle

1. **ACTIVE:** Fully validated, mounted in `/models`, assigned to active camera streaming pipelines.
2. **TESTING (Shadow Mode):** Runs concurrently against live streams for latency and false positive benchmarking without generating operator alerts.
3. **DISABLED:** Temporarily suspended by security administrator or during scheduled maintenance.
4. **DEPRECATED:** Replaced by newer model version; retained for historical evidence playback re-evaluation.

---

## 3. Dynamic Thresholds & Sensitivity Profiles

| Detection Class | Minimum Confidence Threshold | NMS IoU Threshold | Default Camera Assignment |
| :--- | :---: | :---: | :--- |
| **Person Detection** | 0.45 | 0.45 | All Branch Cameras |
| **Vault Dual-Control**| 0.65 | 0.40 | Vault / Strong Room Cameras |
| **Cash Tray Open** | 0.70 | 0.35 | Cash Counter Cameras |
| **ATM Tampering** | 0.60 | 0.45 | ATM Kiosk Internal Cameras |
| **License Plate OCR**| 0.75 | 0.30 | Parking & Driveway Entry Cameras |
