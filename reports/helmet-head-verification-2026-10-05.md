# Helmet detector 1.2.0 — local correction

The recurring Bettaih alerts were produced by the EfficientNet helmet classifier
on estimated person strips, without independent head localization. Some strips
contained hair, chairs, gates or the camera timestamp and still scored above the
alert threshold. Agreement among several such crops was insufficient.

The default production detector now loads a separate, checksum-verified head
localizer. Classifier-only candidates must have a matching head box and positive
classification of both the localized head and its surrounding context. An
exposed-face alternative is restricted to a separately helmet-labelled box with
a positive crown classification and usable source pixels. Bare-head observations
cannot retry crown strips. The existing person and crop checks remain in place.
Alert snapshots use the verified location and metadata retains the independent
localization confidence. Missing verification models fail closed, including on
repeated initialization attempts. Verification happens before a frame can
advance consecutive confirmation; a rejected head clears the pending count.

## Validation

- 35 image fixtures: 32 reported false-alarm examples and 3 genuine helmet controls.
- 70 replay cases: all fixtures in both fast and normal alert modes, including
  repeated timestamps and subsequent distinct frames; all pass.
- Default-detector unit checks cover verification loading, missing models and
  initialization retries. Verification checks cover contrary head evidence,
  another person's head, tiny crops, context disagreement and frame isolation.
- RGB letterbox decoding is checked against known source-image coordinates.
- The focused detector/inference run passed 80 tests. Full-suite runs had one
  application-test timeout at the default 20-second limit while initializing
  the ONNX models; that test passed when run alone. The sequential suite is
  rerun with a 60-second test limit to accommodate model cold start passed all
  93 tests across six files; output is in `tmp/helmet-head-final-cold-start-tests.log`.
- TypeScript compilation output is in `tmp/helmet-head-build-1.2.0/`.

The localization model is pinned to `zhaocaimiao1029/AI_HELMET` revision
`0dbcbd7fb7d1ab25f5ed507ff49d94768309fe3a`, with SHA-256
`8afe10f62194df0980aa50d8017588b2936e786b7a467b59d3df572b18f43f32`.
Its MIT license is retained beside the model. It corroborates head locations;
its generic helmet class is not used alone to create an alert. These replay
results establish behavior for the supplied fixtures, not a universal accuracy
claim for other cameras or conditions.

## Deployment status

**Local only, as requested. The running server was not modified.** Automatic
approval review rejected uploading the original validation archive because it
contained private snapshots, and rejected the revised code/public-model archive
because destination authorization was not established. The user subsequently
selected “Keep the fix local.” Neither archive was transferred. Server-original
validation and deployment were therefore not run for this version.
Temporary validation JPEG copies and the image-containing archive were removed;
the user's original files were retained.
