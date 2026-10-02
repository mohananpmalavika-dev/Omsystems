# Helmet worn detection — 2 October 2026

The pilot channel 6 cached image visibly shows a black motorcycle helmet. The
deployed PaddleClas safety-helmet classifier rejected it, even though the
helmet-worn rule was enabled and person detection succeeded. Before the fix,
the upper-body and head crops returned helmet probabilities of 0.04789 and
0.00198 respectively. Matching PaddleClas's official center-crop preprocessing
alone did not fix the sample (0.04207 and 0.00084).

The runtime helmet model now uses the pinned EfficientNet-B0 motorcycle helmet
head classifier from `vivekvar/helmet-v5`. Its ImageNet-normalized bilinear
stretch input and mandatory softmax output processing follow the upstream
training/export contract. The packaged model embeds all weights in one file;
the Docker build verifies the graph, weights and packaged SHA-256 values.
The legacy PaddleClas preprocessing remains available for legacy manifests.

The existing 0.9167 confidence floor, agreement between two crops, and
confirmation across distinct frame timestamps remain in place. Detector
version is now 1.1.0.

## Verification

- The actual packaged model loaded through the configured model loader.
- The same channel 6 image generated `helmet-worn` at 0.99994149 confidence
  after two distinct replay timestamps. Its first observation and a repeated
  identical timestamp generated no alert.
- The channel 7 partial-body sample generated no helmet-worn alert.
- The public PaddleClas cap-only control returned 0.01208783 helmet confidence.
- **29 relevant tests passed**: 16 inference/rule tests and 13 helmet detector
  tests. Analytics TypeScript checks and build passed.
- The earlier broader specialty run had one unrelated fire confirmation test
  failure. That behavior was not changed.
- Full Docker image build was not run because the local Docker daemon is
  unavailable. The Python packaging stage was exercised locally and its output
  passed the runtime checksum check and real ONNX inference replay.

Raw replay results: [helmet-worn-replay-2026-10-02.json](helmet-worn-replay-2026-10-02.json).
Replay command: `node node_modules/tsx/dist/cli.mjs scratch/validate-motorcycle-helmet.ts`.
The camera samples used by the replay remain local in `tmp/`; they are not
included in the release bundle. No replay alerts were submitted to production.

## Deployment status

The fix is prepared locally. The running production model and detector have
not been replaced or restarted. Deploy the updated analytics image, or apply
the prepared runtime/model bundle with backup and rollback of the three JS
files and the helmet entry in the existing manifest. Preserve other runtime
model entries. Production activation restarts the analytics service shared by
all cameras.

The measured confidence is a model score on this reproduced failure, not a
general accuracy estimate. Wider camera, lighting and helmet coverage has not
been evaluated.

## Sources

- [Pinned replacement model](https://huggingface.co/vivekvar/helmet-v5/tree/4ea2eb67301722073555448b477178330e40f7d1)
- [Training and ONNX export](https://huggingface.co/vivekvar/helmet-v5/blob/4ea2eb67301722073555448b477178330e40f7d1/tools/train_helmet_v5.py)
- [Original PaddleClas preprocessing](https://github.com/PaddlePaddle/PaddleClas/blob/release/2.6/ppcls/configs/PULC/safety_helmet/PPLCNet_x1_0.yaml)
