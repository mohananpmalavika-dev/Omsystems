# Analytics AI status

## Current source contract

The analytics image performs local CPU inference only. It does not call a paid
AI API or require a model-hosting account.

The production Docker build packages and checksum-verifies these required
models:

| Capability | Model |
| --- | --- |
| Person, vehicle and generic-object detection | YOLOX Tiny |
| Motorcycle-rider helmet compliance | PaddleClas PULC safety-helmet classifier |
| Face detection | OpenCV Zoo YuNet |
| Face embedding | OpenCV Zoo SFace INT8 |
| License-plate detection | OpenCV Zoo LPD-YuNet |
| License-plate OCR | OpenCV Zoo CRNN English INT8 |

Helmet detection is classification of the head/upper-body crop associated with
a rider. The official PaddleClas archive is downloaded and converted to ONNX in
the Docker build stage; Paddle and the converter are not present in the runtime
image.

The exact model sources, versions, hashes and licenses are in
[`THIRD_PARTY_MODELS.md`](./THIRD_PARTY_MODELS.md) and
[`models/manifest.json`](./models/manifest.json).

## Readiness

`ANALYTICS_REQUIRE_MODELS=true` is set both by the Docker image and in
`render.yaml`. The service reports readiness only after all six required local
models load successfully. Optional fire/smoke, pose, attribute and re-ID models
do not block readiness.

Use these checks after a build or deploy:

```bash
npm run models:verify --workspace @sentinel/analytics-engine
npm test --workspace @sentinel/analytics-engine
curl https://<analytics-host>/health | jq '.aiState, .pipeline.models'
```

`AI_OPERATIONAL` means every required model loaded. `AI_DEGRADED` after a
deploy means the deployed image, not this source checkout, needs inspection in
its build or runtime logs.

## Deployment

Render builds `analytics-engine/Dockerfile` from the repository root. Do not
configure `*_MODEL_URL` or `*_MODEL_SHA256` variables for YOLOX, helmet, face,
or ANPR: their immutable sources and hashes are already pinned in the manifest
and the image build provisions them. No external inference service is needed
for these features.

The older live-service status and manual model-hosting instructions were
retired with this local-model packaging change.
