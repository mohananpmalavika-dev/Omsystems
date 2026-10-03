# Helmet incident snapshots — 3 October 2026

The deployed `sentinel-gcp-analytics-engine` detector was inspected read-only
and is still version **1.1.0**. It lacks the independent person-confidence
gate already present in repository version **1.1.1**. This deployment mismatch
leaves estimated head crops eligible for helmet alarms on chairs and bare heads.

Version 1.1.1 requires person confidence of at least 0.90 for classifier-only
helmet evidence, agreement from both crops, and confirmation at a second
timestamp. Missing or weak person observations clear pending confirmation.
Localized helmet observations retain their existing threshold.

All five supplied annotated snapshots were replayed locally using the actual
YOLOX and motorcycle-helmet ONNX models at three timestamps. Every snapshot
produced **zero alerts**. The known motorcycle-helmet image still produced
an alert after the second timestamp. This is static-image regression evidence;
the red annotations can affect inference and it is not live-camera validation.

The highest person scores in the five snapshots were 0.7765, 0.6170, 0.7408,
0.6897, and 0.8263. Added regression cases reject these scores even if the
crop classifier returns 0.99999. The analytics workspace's default test command
now includes the helmet false-alarm suite.

Validation: 49 focused tests passed; analytics TypeScript checking and build
passed. Replay: `node node_modules/tsx/dist/cli.mjs scratch/replay-helmet-incident-snapshots.ts`.
Evidence: [replay JSON](helmet-incident-snapshots-replay-2026-10-03.json).

The detector-only deployment bundle is prepared in
`tmp/helmet-person-gate-2026-10-03/`. It contains the compiled 1.1.1 detector,
SHA-256 checksum, verification evidence, and deployment/rollback instructions.
Production has not yet been changed. Activating this fix requires replacing
the running detector and restarting only the analytics container.

Classifier-only genuine helmet wearers with person confidence below 0.90 are
also suppressed. A broader camera dataset is needed to measure that tradeoff.
