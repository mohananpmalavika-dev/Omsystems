# Analytics model artifacts

`manifest.json` is the runtime contract. The production Docker build downloads
the required model directly from its reviewed upstream source, verifies its
fixed SHA-256, and copies it into the runtime image. ONNX weights remain
excluded from Git.

## Required runtime set

| Model ID | Runtime path | Contract |
| --- | --- | --- |
| `yolov8n` (compatibility ID) | `detection/yolox_tiny.onnx` | Official YOLOX Tiny COCO `[1,3549,85]`, BGR letterbox `1x3x416x416` |
| `face-detector` | `face/face-detector.onnx` | OpenCV Zoo YuNet, native 12-output face/landmark decoder, BGR `1x3x640x640` |
| `face-embedding` | `face/face-embedding.onnx` | OpenCV Zoo SFace INT8, five-point aligned RGB `1x3x112x112` |
| `anpr-detector` | `vehicle/license-plate-detector.onnx` | OpenCV Zoo LPD-YuNet, native corner decoder, BGR `1x3x240x320` |
| `anpr-recognizer` | `vehicle/license-plate-recognizer.onnx` | OpenCV Zoo CRNN INT8, rectified grayscale `1x1x32x100` |

Fire/smoke, helmet/head, pose, attributes and re-identification models remain
optional. They are not reported as ready unless an operator supplies reviewed
artifacts matching the manifest contract. Helmet compliance is deliberately
degraded until its official PaddleClas source has a reproducibly converted and
checksum-pinned ONNX artifact.

The YOLO adapter also supports `yolov5` objectness output and post-NMS `xyxy` rows when the manifest `decoder` is changed. Bounding boxes are normalized before they enter rules, alerts or tracking.

## Provisioning

Review `../THIRD_PARTY_MODELS.md`, acknowledge the model license, and run:

```bash
ANALYTICS_MODEL_LICENSES_ACCEPTED=true npm run models:download -- yolov8n face-detector face-embedding anpr-detector anpr-recognizer
npm run models:verify
```

Provisioning uses HTTPS, downloads to a temporary file, verifies SHA-256, and only then moves the artifact into place. `models:verify` opens every required model with ONNX Runtime; it fails if a file is missing, corrupt, has the wrong checksum, or cannot be loaded.

Production containers set `ANALYTICS_REQUIRE_MODELS=true`. With that setting, missing required artifacts keep `/health` unready instead of silently reporting an engine with zero models. Authenticated normalized observations remain a deliberate development or edge-inference fallback when the setting is false.

## Compatibility testing

Model provenance and validation data must be recorded outside this repository. Before enabling alerts, verify the exact artifact on representative deployed cameras for:

- daylight, night/IR, glare, rain and occlusion;
- fire/smoke false alarms and temporal persistence;
- helmet/head visibility and rider association;
- face-detection consent, privacy and retention policy;
- country-specific plate formats and OCR accuracy;
- CPU/GPU latency, sustained stream count and memory use.

Passing unit tests proves the tensor and detector contracts. It is not an accuracy or field-certification claim.
