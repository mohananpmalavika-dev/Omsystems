# AI Models Directory

This directory contains pre-trained machine learning models for the Analytics Engine.

## Required Models

### Core Detection Models

1. **YOLOv8n** (`detection/yolov8n.onnx`)
   - General purpose object detection
   - Size: ~6 MB
   - Classes: 80 COCO classes (person, car, truck, etc.)
   - Provision with `npm run models:download` from `analytics-engine` (requires Bash, Python 3 and an outbound connection), or mount an equivalent model at `/app/models/detection/yolov8n.onnx`.
   - A legacy flat `/app/models/yolov8n.onnx` mount and `YOLO_MODEL_PATH` are also accepted.

2. **Person Detection** (`person-detection-v2.onnx`)
   - Optimized person detection with pose keypoints
   - Recommended: MoveNet, OpenPose, or custom trained model
   - Size: ~10-30 MB

3. **Vehicle Detection** (`vehicle-detection-v2.onnx`)
   - Vehicle type classification (car, motorcycle, bus, truck, bicycle)
   - Can use YOLOv8 fine-tuned on vehicle datasets
   - Size: ~10-20 MB

### Specialized Models

4. **Helmet Detection** (`helmet-detection-v1.onnx`)
   - Detects helmets and heads for safety compliance
   - Recommended: Custom trained YOLO on helmet dataset
   - Size: ~5-10 MB

5. **Face Recognition** (`face-recognition-v1.onnx`)
   - Face detection + embedding extraction
   - Recommended: InsightFace, FaceNet, ArcFace
   - Size: ~10-50 MB

6. **ANPR** (`anpr-v2.onnx`)
   - License plate detection and OCR
   - Recommended: LPRNet, EasyOCR
   - Size: ~20-40 MB

7. **Fire & Smoke Detection** (`fire-smoke-v1.onnx`)
   - Early fire and smoke detection
   - Recommended: FireNet, custom trained model
   - Size: ~5-15 MB

8. **Fall Detection** (`fall-detection-v1.onnx`)
   - Human fall detection with pose analysis
   - Recommended: Custom trained CNN or pose-based model
   - Size: ~10-20 MB

## Model Format

All models should be in **ONNX format** for compatibility with `onnxruntime-node`.

## Converting Models to ONNX

### PyTorch to ONNX
```python
import torch

model = YourModel()
model.load_state_dict(torch.load('model.pth'))
model.eval()

dummy_input = torch.randn(1, 3, 640, 640)
torch.onnx.export(
    model,
    dummy_input,
    'model.onnx',
    input_names=['images'],
    output_names=['output'],
    dynamic_axes={'images': {0: 'batch'}, 'output': {0: 'batch'}}
)
```

### TensorFlow to ONNX
```bash
pip install tf2onnx
python -m tf2onnx.convert --saved-model model_dir --output model.onnx
```

### Ultralytics YOLOv8 to ONNX
```python
from ultralytics import YOLO

model = YOLO('yolov8n.pt')
model.export(format='onnx')
```

## Model Optimization

For production deployment, optimize models:

```bash
# Install ONNX optimizer
pip install onnxoptimizer

# Optimize model
python -c "
import onnx
from onnxoptimizer import optimize

model = onnx.load('model.onnx')
optimized_model = optimize(model)
onnx.save(optimized_model, 'model_optimized.onnx')
"
```

## Model Testing

Test models before deployment:

```typescript
import * as ort from 'onnxruntime-node';

async function testModel(modelPath: string) {
  const session = await ort.InferenceSession.create(modelPath);
  console.log('Input:', session.inputNames);
  console.log('Output:', session.outputNames);
  
  // Test inference
  const dummyInput = new ort.Tensor(
    'float32',
    Float32Array.from({length: 3 * 640 * 640}, () => Math.random()),
    [1, 3, 640, 640]
  );
  
  const results = await session.run({images: dummyInput});
  console.log('Output shape:', results.output.dims);
}
```

## Pre-trained Model Sources

- **YOLOv8**: https://github.com/ultralytics/ultralytics
- **InsightFace**: https://github.com/deepinsight/insightface
- **LPRNet**: https://github.com/sirius-ai/LPRNet_Pytorch
- **FireNet**: https://github.com/tobybreckon/fire-detection-cnn
- **OpenPose**: https://github.com/CMU-Perceptual-Computing-Lab/openpose

## Model License Compliance

Ensure all models comply with licensing requirements:
- Commercial use allowed
- Attribution requirements met
- No redistribution restrictions

## Performance Benchmarks

Target performance (on CPU):
- Person detection: <100ms per frame
- Vehicle detection: <120ms per frame
- Helmet detection: <80ms per frame
- Face recognition: <150ms per frame
- ANPR: <200ms per frame

## Directory Structure

```
models/
├── README.md                    # This file
├── yolov8n.onnx                # Core object detection
├── person-detection-v2.onnx    # Person detection
├── vehicle-detection-v2.onnx   # Vehicle detection
├── helmet-detection-v1.onnx    # Helmet detection
├── face-recognition-v1.onnx    # Face recognition
├── anpr-v2.onnx                # License plate recognition
├── fire-smoke-v1.onnx          # Fire & smoke detection
└── fall-detection-v1.onnx      # Fall detection
```

## Need Help?

Contact the AI/ML team for:
- Custom model training
- Model optimization assistance
- Integration support
- Performance tuning
