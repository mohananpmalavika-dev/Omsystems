# Walking-person helmet validation

The detector supports walking people when the source frame contains usable
person and complete-head evidence. An installed model file or successful
startup does not prove a particular walking pass will alert.

## Actual configuration and gates

- The analytics pipeline defaults HELMET_CONFIDENCE_THRESHOLD to 0.75.
  This is not the final helmet evidence threshold: adapted complete-head
  classification requires at least max(configured threshold, 0.80), while
  legacy helmet crops retain their 0.9167 floor.
- Adapted evidence requires person confidence at least 0.80, person height
  at least 72 source pixels, and an associated head at least 20x20 source
  pixels. A low object-candidate threshold such as 0.35 does not bypass these
  checks. Frame-relative width/aspect filters are not used to identify people.
- HELMET_HEAD_EVIDENCE_CAMERAS=* enables the adapted model for all cameras.
  A comma-separated camera list limits it. An empty value disables that model
  in the default detector; it does not mean all cameras.
- In the analytics pipeline, fast alerts are enabled unless HELMET_FAST_ALERT
  is exactly false. Strong adapted evidence (at least 0.90 on both crops)
  can confirm on one capture in fast mode; weaker adapted evidence requires
  two distinct timestamps. Non-fast mode uses two or three observations.
- The 0.20 IoU threshold matches pending helmet confirmations. Pending state
  expires after 120 seconds and is cleared by contrary or missing person/head
  evidence. This is not a guaranteed 4-6 second alert latency.
- Face and pose checks belong to legacy verification. Adapted full-head
  verification supports a visible face inside an open/transparent visor.
  Lowering thresholds or adding a bare-face veto can reintroduce past misses.
- HD capture has a separate control-plane allowlist,
  HELMET_HD_CAPTURE_CAMERAS. Its empty default retains 640x360. Enable the
  CH9 camera ID for a pilot; * expands HD capture only to cameras with
  enabled helmet-worn rules. This needs the updated server and gateway.

The scripts below inherit the invoking process environment, not an automatic
.env import. They print their effective offline settings, run CPU inference,
and never send events or notifications to production. They use sharp already
installed in the project; canvas is not required.

## Build and health check

From the repository root on Windows:

    npm.cmd run build --workspace @sentinel/analytics-engine
    node analytics-engine/debug-helmet-detection.mjs

A no-image run checks model loading only. It does not inject a mock person
into a black image or claim to validate walking detection. Missing or invalid
models cause a nonzero exit. Model presence and detector health do not prove
all optional models loaded; inspect the reported loaded model IDs.

To use adapted evidence in the offline process:

    $env:HELMET_HEAD_EVIDENCE_CAMERAS="*"

To inspect a real frame, preserve its actual capture time:

    node analytics-engine/debug-helmet-detection.mjs --frame path/to/frame.jpg --captured-at 2026-10-07T11:40:35.560Z --camera actual-camera-id

For a raw RGB24 .rgb capture, also supply its original --width and --height.
JPEG/PNG inputs are decoded to RGB24; RGBA is never passed to the detector.
One image can explain a detection result, but cannot test temporal confirmation.

## Labelled sequence replay

Create a JSON manifest with a cases array. Each case contains:

- name: a descriptive label.
- cameraId: optional actual source camera ID; otherwise --camera or
  helmet-validation is used. Match the model camera allowlist.
- expectedHelmetWearers: the expected maximum number of alerted helmet
  wearers in the sequence, not the number of people or result records.
- minConfidence: optional minimum confidence for positive alerts.
- frames: real consecutive captures, each with file and capturedAt;
  raw .rgb entries also require width and height.

Paths are relative to the manifest file. Use strictly increasing real
timestamps and different frame files. Replaying one still image under invented
timestamps is rejected. With fast alerts disabled, positive cases need at
least two captures; a miss still fails if the required confirmations never occur.
Include both confirmed helmet-positive and negative cases (bare heads,
chairs, hats and background objects). In a mixed scene with one helmet wearer
and one bare-headed person, expectedHelmetWearers is 1.

Run from the repository root:

    node analytics-engine/test-helmet-walking.mjs --manifest path/to/cases.json --output reports/walking-validation.json

Or from analytics-engine:

    node test-helmet-walking.mjs --manifest path/to/cases.json

Missing files, empty/all-negative datasets, invalid frames, model failures and
expectation mismatches fail the run. Confirmation state is reset between cases.
One helmet-worn result may aggregate several wearers; validation reads the
compliantCount metadata instead of counting result records. Negative cases
must produce zero helmet-worn alerts throughout their sequence.

## Regression and field checks

From the repository root:

    node node_modules/vitest/vitest.mjs run analytics-engine/test/helmet-head-verification.test.ts analytics-engine/test/helmet-false-alarms.test.ts analytics-engine/test/helmet-replay.test.ts

Existing measured replay evidence is in
[the walking fix report](../reports/helmet-walking-fix-2026-10-07.md).
It does not establish 95% accuracy, a false-positive percentage, 30 FPS
processing or a fixed end-to-end latency. Measure those using a representative,
labelled field dataset and actual capture/alert timestamps.

A CH9 field check still needs fresh complete-wearer captures and a naturally
generated alert after deployment. Check source resolution, freshness, person
detection, head localization and classifier scores before changing confidence
settings. This guide does not publish a release or change live camera rules.
