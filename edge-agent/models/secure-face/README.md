# Secure-area local face models

This directory deliberately ships without biometric model binaries. A branch operator must place three reviewed ONNX artifacts beside a copy of `manifest.example.json` renamed to `manifest.json`.

- `detector.onnx` must produce post-NMS rows in `[x, y, width, height, score, ...]` format for a 320×320 RGB image.
- `recognizer.onnx` must accept 112×112 RGB CHW `[-1,1]` input and produce a 512-value embedding.
- `liveness.onnx` must accept RGB CHW input and produce two logits with class 1 representing a live person.

Set the exact SHA-256, model name, and model version in the manifest, then run `npm run verify:secure-face-models --workspace @sentinel/edge-agent`. The runtime refuses every missing, modified, undersized, or unverified artifact.

Set these only after the branch has an approved biometric policy and consent process:

```text
SECURE_FACE_AI_ENABLED=true
SECURE_FACE_MODEL_MANIFEST=./models/secure-face/manifest.json
SECURE_FACE_INGEST_TOKEN=<32+-character random secret>
SECURE_FACE_MIN_LIVENESS=0.95
SECURE_FACE_MIN_OBSERVATIONS=3
```

The control plane's `SECURE_AREA_EDGE_INGEST_TOKEN` must contain the same secret. The edge agent keeps frames and inference local; it transmits only a live, repeatedly-observed normalized embedding, bounding box, and audit metadata to the secure-area endpoint.
