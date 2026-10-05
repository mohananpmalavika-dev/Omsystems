# Helmet false-alert batch fix — 5 October 2026

Detector **1.1.8 is deployed** on `kryptovision-server`. Only the analytics
service was recreated. Its active compiled detector matches the validated
build; health reports `AI_OPERATIONAL`, healthy helmet inference, operational
notification submission, and `HELMET_FAST_ALERT=true`.

The user supplied 20 snapshot filenames representing 13 unique scenes from
Peravurani, Hajipur and Bettaih. Every scene matched a stored annotated incident
by exact image hash. The stored originals were replayed inside isolated server
containers, with no camera images exported to the workstation and no production
events submitted by validation.

## Cause and correction

The helmet crop classifier sometimes gives near-certain helmet scores to hair,
dark gates, chairs and timestamp backgrounds. Two overlapping crops can agree
on the same misleading feature. JPEG annotation also changes person boxes,
which can send the same scene through different fallback paths.

- Raised-head fallback now requires a third crop centered inside the person
  box, alongside the existing two raised crops. All three must reach 0.98,
  including fast mode. Fast mode still alerts on the first qualifying frame.
- Compact fallback now checks the crown above the person box and a narrower,
  taller crop spanning crown through face, in addition to its existing compact
  and surrounding crops. All supporting scores must pass the existing alert
  floor. Events retain the weakest supporting confidence.
- Rejected evidence clears pending confirmation, preventing earlier positives
  from carrying through contradictory frames.

The first candidate passed annotated-image checks but original-frame replay
caught three remaining scenes. No activation occurred until the revised
candidate rejected those originals too. The candidate packaging permission
issue was corrected before activation.

## Validation

- 76 tests passed across the five default analytics test files.
- TypeScript checking passed.
- A complete build passed in a fresh output directory after an unrelated
  existing generated governance file was locked. Its helmet JavaScript SHA256
  exactly matches the deployed artifact:
  `05dcd0c6a20271dac47821283a561a578306b51f6c96594d4d3fced4bc4e1a19`.
- The server candidate passed **94 isolated replay checks** using the deployed
  model files: 31 supplied/prior/control fixtures in both modes (62 checks),
  plus 16 stored originals in both modes (32 checks).
- All 20 supplied snapshots, all matched original scenes, their matching
  duplicate events, and an additional closely repeated locker event produced
  zero helmet alerts. Eight earlier false-alarm fixtures remained rejected.
- All three known actual helmet controls retained their expected detections:
  raised, compact and standard paths, including immediate fast-mode alerts.
- Whitespace checks passed. Activation health and exact compiled-file checks
  passed, with automatic rollback configured for activation failures.

This addresses the supplied false-alarm patterns, not a guarantee that the
binary crop classifier can never misclassify a new scene. Stronger corroboration
may reject difficult or partially visible real helmets. Snapshot replay uses
stored JPEGs; live RGB scores can differ. No camera-wide mute was introduced,
and no unrelated historical alerts were changed.

Active image:
`sha256:1b0d387829373e93ee0b65e3c5f85c0ff6fcc32af781dd54279dbdbcbe1151e8`.

Rollback image:
`sentinel-gcp-analytics-engine:before-helmet-batch-1.1.8-20261005`.

Server backups, validation logs and activation marker:
`/tmp/sentinel-helmet-batch-1.1.8-20261005`.

Reproducible validation and deployment scripts are in `scratch/`, including
`validate-helmet-batch-2026-10-05.mjs`,
`validate-helmet-batch-candidate-2026-10-05.sh` and
`activate-helmet-batch-2026-10-05.sh`.
