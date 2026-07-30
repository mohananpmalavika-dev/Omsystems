# AI video analytics deployment

## What is implemented

The service extracts RGB24 frames with FFmpeg and runs ONNX Runtime locally. The active local paths are:

- YOLO COCO person and object detection;
- YOLO-compatible fire/smoke detection;
- YOLO-compatible helmet/head detection combined with person/rider tracking;
- YOLO-compatible face detection, with optional local face embeddings;
- two-stage ANPR using a YOLO-compatible plate detector and CTC recognizer.

Authenticated normalized detections remain supported for deployments that deliberately run inference at the edge. They are a fallback, not evidence that a local model is loaded.

## Model artifacts

Model binaries are not committed. Their licensing, provenance, training data and accuracy must be approved for the deployment. The checked-in `models/manifest.json` defines the exact tensor, label and path contract. Do not rename an SSD, RetinaFace, Paddle inference archive or PyTorch checkpoint to a manifest filename: a different architecture requires its own pre/postprocessor.

Configure an approved HTTPS artifact and SHA-256 for every required model. See `.env.example`, then run:

```bash
cd analytics-engine
ANALYTICS_MODEL_LICENSES_ACCEPTED=true npm run models:download
npm run models:verify
```

The provisioning command downloads to a temporary file and promotes it only after checksum verification. The verification command opens all six required artifacts with ONNX Runtime and fails on missing, corrupt or incompatible models.

## Production readiness

Production images set:

```env
MODELS_DIR=/app/models
ANALYTICS_REQUIRE_MODELS=true
```

With strict readiness enabled, a missing required model prevents pipeline initialization and `/health` returns HTTP 503. Without strict readiness, `/health` returns `degraded` with `pipeline.models.missingRequired`; normalized edge observations can still be processed.

### Render deployment mode

The checked-in Render blueprint does not attach an approved model volume, so it
explicitly sets `ANALYTICS_REQUIRE_MODELS=false`. This lets the service accept
authenticated normalized observations from edge inference workers and makes
Render's `/health` deployment check return HTTP 200 with `status: degraded`.
The response continues to expose the missing required model IDs; this mode must
not be represented as local inference.

To enable local inference on Render, attach or provision every manifest artifact,
run `npm run models:verify` against that exact directory, and only then change
`ANALYTICS_REQUIRE_MODELS` to `true`. Enabling strict mode without the artifacts
intentionally produces HTTP 503 and blocks deployment.

Useful endpoints:

- `GET /health` — detector health plus configured, available and loaded model counts;
- `GET /v1/analytics/models/inventory` — per-artifact path, size and status;
- `GET /v1/analytics/models/loaded` — current lazy-load cache only.

“Available” and “loaded” are deliberately separate. A valid artifact may be available before its detector is first used.

## Container deployment

Mount the reviewed model directory read-only at `/app/models`. It must contain `manifest.json` and the paths specified by that manifest. The image includes FFmpeg and ONNX Runtime but does not download third-party weights during the image build.

```yaml
services:
  analytics-engine:
    build:
      context: ..
      dockerfile: analytics-engine/Dockerfile
    environment:
      MODELS_DIR: /app/models
      ANALYTICS_REQUIRE_MODELS: "true"
      ENABLE_GPU_ACCELERATION: "false"
    volumes:
      - ./approved-models:/app/models:ro
```

Run `npm run models:verify` against the mounted artifact set before promoting an image.

## Validation required before alerts

The automated tests verify tensor decoding, normalized bounding boxes, model lifecycle, detector orchestration, CTC decoding and fallback behavior. They do not certify model accuracy.

Field acceptance must cover representative deployed cameras and include:

- day, night/IR, glare, weather, compression and occlusion;
- fire/smoke false-positive and persistence testing;
- helmet/head visibility and rider association;
- face consent, privacy, watchlist governance and deletion;
- country-specific plate formats and OCR accuracy;
- sustained CPU/GPU stream capacity, latency, memory and thermal behavior.

Store the model ID, SHA-256, license, dataset/version, thresholds and field results with the deployment evidence. A different hash is a different model release and must be revalidated.
