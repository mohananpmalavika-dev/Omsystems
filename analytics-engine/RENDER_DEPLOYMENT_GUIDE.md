# Render deployment guide

## Current production path

`render.yaml` deploys `analytics-engine/Dockerfile` with the repository root as
its build context. The image is self-contained for the required free local AI
features; no paid AI API, API key, object storage, or manual model URL is
needed.

The Docker build checksum-verifies and packages:

| Feature | Packaged model |
| --- | --- |
| Person / vehicle / generic detection | YOLOX Tiny |
| Helmet compliance | PaddleClas PULC safety-helmet classifier |
| Face detection and embedding | OpenCV Zoo YuNet and SFace INT8 |
| License-plate detection and OCR | OpenCV Zoo LPD-YuNet and CRNN INT8 |

The helmet source is the official Apache-2.0 PaddleClas archive. It is converted
to its pinned ONNX artifact in a temporary build stage, so Paddle and its
conversion tools are excluded from the runtime image.

## Deploy

1. Commit and push the source changes.
2. Deploy the latest revision through Render (or trigger the Blueprint deploy).
3. Inspect the image build log for the checksum-verified model provisioning.
4. Check service health:

   ```bash
   curl https://<analytics-host>/health | jq '.aiState, .pipeline.models'
   ```

Expected result: `AI_OPERATIONAL`, with six required models loaded.

`ANALYTICS_REQUIRE_MODELS=true` is deliberately set in the Dockerfile and
`render.yaml`; a model packaging fault therefore fails readiness instead of
silently disabling local inference.

## Before deploying

Run the same validations locally:

```bash
npm run models:verify --workspace @sentinel/analytics-engine
npm test --workspace @sentinel/analytics-engine
npm run build --workspace @sentinel/analytics-engine
```

The optional fire/smoke, pose, attribute and re-identification models are not
required for readiness. Their optional source URLs remain configurable only when
you choose to add them.

## Do not configure legacy model URLs

Do **not** set `YOLO_MODEL_URL`, `HELMET_MODEL_URL`,
`FACE_DETECTION_MODEL_URL`, `FACE_EMBEDDING_MODEL_URL`,
`ANPR_DETECTION_MODEL_URL`, or `ANPR_RECOGNITION_MODEL_URL`. Current required
artifacts are immutable, checksum-pinned sources defined in
[`models/manifest.json`](./models/manifest.json). Override paths only for a
deliberately audited replacement model.

For model provenance and licenses, see
[`THIRD_PARTY_MODELS.md`](./THIRD_PARTY_MODELS.md).
