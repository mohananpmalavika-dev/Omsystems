# Helmet false alarms — 5 October 2026

Detector 1.1.7 is deployed to the analytics service on kryptovision-server.
The active compiled file matches the locally built and replay-tested file.
The service reports AI_OPERATIONAL, healthy helmet inference and operational
notification submission. Activation recreated only the analytics service.

The three supplied attachments represent two scenes: 12:41:30 and 13:19:01 IST
at STAFF+CUS HAJIPUR. Both show bare heads. Matching event originals were
retrieved and visually checked:

- `f0b4f55e-00c0-442c-a0e1-3d6a05150bdf` / alert
  `70f23fb0-2143-4dd8-b436-a777729d6e2d`: 12:41 scene.
- `f5781a86-8527-4a30-a94a-3f256555fbcb` / alert
  `2e9a1306-3c40-4963-930a-98b716d27440`: 13:19 scene.

The live service previously ran 1.1.6 with HELMET_FAST_ALERT=true. In the
12:41 original JPEG replay, person confidence is 0.900316. Compact 15%-height
head crops incorrectly score 0.942799 and 0.981397; their source height is
18.79 pixels. The raised head context disagrees (0.484710 on its narrow crop).
The original detector generates an immediate helmet-worn alarm from these
crops. The 13:19 JPEG already fails crop agreement during local replay;
its compact region is only 15.06 pixels tall. Snapshots are compressed JPEG
exports of inference frames, so they do not reproduce every original RGB
score. The red annotations also change replay scores.

The correction applies to the compact fallback, retaining the standard,
raised-head and independently localized helmet paths:

- Require at least 24 source pixels on each axis of the compact crop.
- Require the narrow raised-context crop to pass the same helmet confidence
  floor as both compact crops.
- Clear pending confirmation on rejection and report the weakest of the
  three supporting classification scores.

Fast alerts remain enabled. This is a conservative crop-classification fix,
not an independently localized helmet model or a general accuracy guarantee.
Very small/distant wearers needing the compact fallback may be missed.

Validation:

- All 71 tests in the analytics default suite passed (60-second test timeout).
- Analytics TypeScript checking, build and git whitespace checking passed.
- Regression tests reject saturated compact positives at both incident box
  sizes and reject contradictory surrounding head context in both alert modes.
- The candidate image passed 22 checks using the exact deployed model files:
  11 fixtures in both fast and repeated-confirmation modes. Both reported
  originals, an earlier bare-head original and five older false snapshots
  produced zero alerts. All three known wearers retained their expected
  detections, including immediate detection in fast mode.
- All supplied annotated attachments produce zero alerts in local replay.
- Candidate replays were isolated and submitted no production events.

The first candidate validation attempt failed because the harness hard-coded
Sharp's internal module path. Activation did not occur. The harness now uses
the application's package resolution; all candidate checks passed before
activation.

Active image: `sha256:33a0d6672a4e4db0fe4439f8fa9445996ccc1e17951f99e99124079f992734c1`.
Rollback image: `sentinel-gcp-analytics-engine:before-helmet-false-alarms-1.1.7-20261005`.
Server backups, validation log and activation marker:
`/tmp/sentinel-helmet-false-alarms-1.1.7-20261005`.
The persisted server TypeScript source was updated along with the image.
The deployment script automatically rolls back if activation health fails.

Evidence: `helmet-false-alarms-2026-10-05-study.json` and
`scratch/validate-helmet-false-alarms-2026-10-05.mjs`.
