# Analytics model artifacts

`manifest.json` is the runtime contract. ONNX weights are deployment artifacts and are intentionally excluded from Git because their licenses, provenance and checksums differ by deployment.

## Required runtime set

| Model ID | Path | Contract |
| --- | --- | --- |
| `yolov8n` | `detection/yolov8n.onnx` | YOLOv8 COCO `[1,84,N]` or `[1,N,84]` |
| `fire-smoke` | `safety/fire-smoke.onnx` | YOLOv8 classes `fire, smoke` |
| `helmet` | `safety/helmet.onnx` | YOLOv8 classes `helmet, head` |
| `face-detector` | `face/face-detector.onnx` | YOLOv8 class `face` |
| `anpr-detector` | `vehicle/license-plate-detector.onnx` | YOLOv8 class `license-plate` |
| `anpr-recognizer` | `vehicle/license-plate-recognizer.onnx` | CTC logits using the manifest alphabet |

`face-embedding` is optional unless face recognition/watchlists are enabled. It must accept an RGB `1x3x112x112` tensor and return one float embedding.

The YOLO adapter also supports `yolov5` objectness output and post-NMS `xyxy` rows when the manifest `decoder` is changed. Bounding boxes are normalized before they enter rules, alerts or tracking.

## Provisioning

Weights must come from an approved internal artifact store or a reviewed upstream source. For each model, configure the URL and SHA-256 variables shown in `.env.example`, acknowledge the model licenses, and run:

```bash
ANALYTICS_MODEL_LICENSES_ACCEPTED=true npm run models:download
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
