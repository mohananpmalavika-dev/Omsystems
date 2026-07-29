# AI Video Analytics - Complete Deployment Guide

## Current Status

### ✅ Fully Implemented
1. **Model Manager** - ONNX runtime with GPU acceleration
2. **Frame Extraction** - FFmpeg-based stream capture
3. **Detection Pipeline** - 30+ detector orchestration
4. **Rule Engine** - Zone-based analytics with confidence thresholds
5. **Event Integration** - Database storage and alert routing

### ⚠️ Requires Model Files
The analytics engine is **code-complete** but requires AI model files to be deployed. The infrastructure is production-ready and will automatically load models when present.

## Why Models Are Not Included

**Licensing & Size**: Pre-trained AI models are:
- **Large**: 50MB–500MB per model
- **Licensed**: Most require attribution or commercial licenses
- **Vendor-specific**: Often trained for specific use cases

**Solution**: Organizations must download/train models based on their specific needs and licensing agreements.

---

## Quick Start

### Prerequisites

```bash
# 1. Install ONNX Runtime
npm install onnxruntime-node

# 2. Install FFmpeg (for frame extraction)
# Ubuntu/Debian
sudo apt-get install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html

# 3. Create models directory
mkdir -p analytics-engine/models
```

### Option A: Download Pre-converted ONNX Models

**YOLOv8 (Object Detection)**
```bash
cd analytics-engine/models

# Download YOLOv8n (11MB)
wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.onnx

# Or convert from PyTorch:
# pip install ultralytics
# yolo export model=yolov8n.pt format=onnx
```

**DeepSORT (Object Tracking)**
```bash
# Download DeepSORT Re-ID model
wget https://github.com/nwojke/deep_sort/releases/download/v1.0/mars-small128.onnx -O deepsort.onnx
```

**RetinaFace (Face Detection)**
```bash
# Convert from PyTorch
git clone https://github.com/biubug6/Pytorch_Retinaface
cd Pytorch_Retinaface
python convert_to_onnx.py --trained_model weights/Resnet50_Final.pth --network resnet50
mv retinaface.onnx ../../analytics-engine/models/
```

**ArcFace (Face Recognition)**
```bash
# Download from InsightFace
wget https://github.com/onnx/models/raw/main/vision/body_analysis/arcface/model/arcfaceresnet100-8.onnx -O arcface.onnx
```

**PaddleOCR (License Plate Recognition)**
```bash
# Download PaddleOCR detection + recognition models
wget https://paddleocr.bj.bcebos.com/PP-OCRv3/english/en_PP-OCRv3_det_infer.tar
tar -xf en_PP-OCRv3_det_infer.tar
# Convert to ONNX using paddle2onnx
```

### Option B: Use Zero-Cost Alternative Models

If commercial models are not available, use these free alternatives:

**MobileNet SSD (Object Detection)**
```bash
wget https://github.com/onnx/models/raw/main/vision/object_detection_segmentation/ssd-mobilenetv1/model/ssd_mobilenet_v1_10.onnx -O yolov8n.onnx
```

**OSNet (Re-Identification)**
```bash
wget https://github.com/KaiyangZhou/deep-person-reid/releases/download/v1.0.0/osnet_x1_0.onnx
```

### Model Directory Structure

```
analytics-engine/models/
├── yolov8n.onnx          # Object detection (11MB)
├── deepsort.onnx         # Object tracking (15MB)
├── osnet_x1_0.onnx       # Re-identification (25MB)
├── retinaface.onnx       # Face detection (30MB)
├── arcface.onnx          # Face recognition (100MB)
├── paddleocr.onnx        # ANPR/OCR (10MB)
└── clip-vit-b32.onnx     # Visual-text embedding (350MB)
```

---

## Configuration

### Environment Variables

```bash
# analytics-engine/.env

# Model Configuration
MODELS_DIR=./models
MODEL_CACHE_SIZE_MB=2048
ENABLE_GPU_ACCELERATION=true
GPU_DEVICE_ID=0

# Frame Extraction
FFMPEG_PATH=/usr/bin/ffmpeg
ANALYTICS_FRAME_WIDTH=640
ANALYTICS_FRAME_HEIGHT=640
ANALYTICS_FRAME_TIMEOUT_MS=10000

# Performance
ANALYTICS_BATCH_SIZE=4
ANALYTICS_MAX_CONCURRENT=10
ANALYTICS_QUEUE_SIZE=100

# Feature Flags
ENABLE_OBJECT_DETECTION=true
ENABLE_FACE_DETECTION=true
ENABLE_ANPR=true
ENABLE_TRACKING=true
```

### Detector Configuration

```typescript
// analytics-engine/src/config/detectors.config.ts

export const DETECTOR_CONFIG = {
  // Object Detection
  objectDetection: {
    enabled: process.env.ENABLE_OBJECT_DETECTION === 'true',
    model: 'yolov8n',
    confidenceThreshold: 0.25,
    nmsThreshold: 0.45,
    classes: ['person', 'vehicle', 'animal'],
  },
  
  // Face Detection
  faceDetection: {
    enabled: process.env.ENABLE_FACE_DETECTION === 'true',
    model: 'retinaface',
    confidenceThreshold: 0.5,
    minFaceSize: 20,
  },
  
  // ANPR
  anpr: {
    enabled: process.env.ENABLE_ANPR === 'true',
    model: 'paddleocr',
    confidenceThreshold: 0.7,
    regions: ['US', 'EU', 'IN'],
  },
};
```

---

## Testing Analytics Engine

### 1. Verify Model Loading

```bash
cd analytics-engine
npm run test:models
```

**Expected Output:**
```
✓ Model Manager initialized
✓ GPU detected: cuda
✓ Loaded yolov8n (234ms, ~11MB)
✓ Loaded deepsort (156ms, ~15MB)
```

### 2. Test Frame Extraction

```bash
# Test with sample RTSP stream
npm run test:frame-extraction -- --url rtsp://camera-ip/stream
```

**Expected Output:**
```
✓ FFmpeg available
✓ Frame extracted (640x640, RGB24)
✓ Frame size: 1.2MB
✓ Extraction time: 1.8s
```

### 3. Test Object Detection

```bash
# Run inference on test image
npm run test:detection -- --image test/fixtures/test-frame.jpg
```

**Expected Output:**
```
✓ YOLOv8 inference completed
✓ Detected objects:
  - person (0.89 confidence) at [x:120, y:340, w:80, h:180]
  - vehicle (0.76 confidence) at [x:450, y:200, w:200, h:150]
✓ Inference time: 45ms
```

### 4. Integration Test

```bash
# Full pipeline test
npm run test:integration -- --camera-id test-cam-001
```

---

## Production Deployment

### Docker Compose (Recommended)

```yaml
# docker-compose.analytics.yml
version: '3.8'

services:
  analytics-engine:
    build:
      context: ./analytics-engine
      dockerfile: Dockerfile
    environment:
      - MODELS_DIR=/app/models
      - ENABLE_GPU_ACCELERATION=true
      - CUDA_VISIBLE_DEVICES=0
    volumes:
      - ./models:/app/models:ro
      - ./analytics-data:/app/data
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    restart: unless-stopped
    networks:
      - analytics-network
```

### Kubernetes Deployment

```yaml
# k8s/analytics-engine.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: analytics-engine
spec:
  replicas: 3
  selector:
    matchLabels:
      app: analytics-engine
  template:
    metadata:
      labels:
        app: analytics-engine
    spec:
      containers:
      - name: analytics
        image: analytics-engine:latest
        resources:
          requests:
            memory: "4Gi"
            cpu: "2"
            nvidia.com/gpu: "1"
          limits:
            memory: "8Gi"
            cpu: "4"
            nvidia.com/gpu: "1"
        env:
        - name: MODELS_DIR
          value: "/models"
        - name: ENABLE_GPU_ACCELERATION
          value: "true"
        volumeMounts:
        - name: models
          mountPath: /models
          readOnly: true
      volumes:
      - name: models
        persistentVolumeClaim:
          claimName: analytics-models-pvc
```

---

## Performance Benchmarks

### Expected Performance (with GPU)

| Operation | Throughput | Latency |
|-----------|-----------|---------|
| Frame Extraction | 30 FPS | 33ms |
| Object Detection (YOLOv8n) | 200 FPS | 5ms |
| Face Detection (RetinaFace) | 150 FPS | 7ms |
| Face Recognition (ArcFace) | 100 FPS | 10ms |
| ANPR (PaddleOCR) | 80 FPS | 12ms |
| Full Pipeline | 15 FPS | 65ms |

### CPU-Only Performance

| Operation | Throughput | Latency |
|-----------|-----------|---------|
| Object Detection | 10 FPS | 100ms |
| Face Detection | 5 FPS | 200ms |
| Full Pipeline | 1-2 FPS | 500ms |

**Recommendation**: GPU strongly recommended for real-time analytics on 10+ cameras.

---

## Troubleshooting

### Issue: "Model file not found"

**Cause**: Models not downloaded to `models/` directory

**Solution**:
```bash
cd analytics-engine/models
ls -lh  # Verify files exist
# Re-download missing models (see Quick Start)
```

### Issue: "ONNX Runtime not found"

**Cause**: ONNX Runtime not installed

**Solution**:
```bash
npm install onnxruntime-node
# For GPU support:
npm install onnxruntime-node-gpu
```

### Issue: "FFmpeg not found"

**Cause**: FFmpeg not in PATH

**Solution**:
```bash
# Check FFmpeg
which ffmpeg
ffmpeg -version

# If missing:
sudo apt-get install ffmpeg  # Linux
brew install ffmpeg          # macOS
```

### Issue: "GPU not detected"

**Cause**: CUDA/GPU drivers not configured

**Solution**:
```bash
# Check NVIDIA GPU
nvidia-smi

# Install CUDA toolkit
# https://developer.nvidia.com/cuda-downloads

# Set environment variable
export CUDA_VISIBLE_DEVICES=0
```

### Issue: "Detection returns empty arrays"

**Possible Causes**:
1. Model confidence threshold too high
2. Wrong input preprocessing
3. Model not compatible with input format

**Debug**:
```typescript
// Lower confidence threshold temporarily
const results = await detector.detect(frame, {
  confidenceThreshold: 0.1  // Very low for testing
});
console.log('Raw results:', results);
```

---

## Model Training (Advanced)

Organizations with specific requirements can train custom models:

### Custom Object Detection

```bash
# Using YOLOv8
pip install ultralytics

# Prepare dataset in YOLO format
# /dataset
#   /images/train/
#   /images/val/
#   /labels/train/
#   /labels/val/

# Train
yolo detect train data=custom.yaml model=yolov8n.pt epochs=100

# Export to ONNX
yolo export model=runs/detect/train/weights/best.pt format=onnx
```

### Custom Face Recognition

```bash
# Using InsightFace
pip install insightface

# Train ArcFace on custom faces
python train.py --network r50 --dataset /path/to/faces

# Export to ONNX
python convert_to_onnx.py --model models/model-r50/model,0 --output arcface-custom.onnx
```

---

## Zero-Cost AI Models Reference

See: `analytics-engine/docs/ZERO_COST_AI_MODELS.md`

Free alternatives for each detection type:
- Object Detection: MobileNet SSD, YOLO-Lite
- Face Detection: OpenCV Haar Cascades, Dlib
- Face Recognition: FaceNet (open-source)
- ANPR: EasyOCR, Tesseract OCR
- Tracking: SORT, IoU Tracker

---

## API Integration

### Trigger Analytics on Demand

```http
POST /api/v1/analytics/process
Content-Type: application/json

{
  "cameraId": "camera-001",
  "rules": [
    {
      "detectionType": "intrusion",
      "zone": {
        "points": [[100, 100], [500, 100], [500, 400], [100, 400]]
      },
      "minConfidence": 0.7
    }
  ]
}
```

### Query Detection Results

```http
GET /api/v1/analytics/events?cameraId=camera-001&from=2026-07-29T00:00:00Z
```

---

## License Compliance

When deploying AI models, ensure compliance with:

1. **Model License** - Check original model licensing terms
2. **Dataset License** - If training custom models
3. **Commercial Use** - Some models prohibit commercial use
4. **Attribution** - Cite model authors as required

**Recommended**: Use models with permissive licenses (Apache 2.0, MIT, BSD) for commercial deployments.

---

## Support

For model-related questions:
- Check `ZERO_COST_AI_MODELS.md` for free alternatives
- Review ONNX Model Zoo: https://github.com/onnx/models
- Consult vendor documentation (Hikvision, Dahua have analytics SDKs)

For deployment issues:
- Check logs: `tail -f analytics-engine/logs/analytics.log`
- Monitor metrics: `curl http://localhost:3001/metrics`
- Enable debug mode: `DEBUG=analytics:* npm start`
