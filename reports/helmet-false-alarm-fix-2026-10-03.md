# Hajipur helmet false alarms — 3 October 2026

The supplied images match the helmet-worn events at 11:04:34 and 11:07:34 IST.
Both used detector 1.1.0's `confirmed-head-classification` fallback. The marked
helmet boxes were estimated from person boxes, rather than localized helmet
observations. The chair was misclassified as a person at approximately 0.67;
the bareheaded visitor scored approximately 0.83. The helmet classifier can
score a chair almost 1.0, so its confidence alone cannot validate a wearer.

Detector 1.1.1 requires an independent person confidence of at least 0.90
before using classifier-only evidence. Localized helmet observations retain
the existing person threshold. The emitted person object preserves its own
detection score instead of inheriting the helmet score. Missing or weak person
observations clear pending confirmation, preventing separated positives from
being combined across an intervening negative frame.

## Verification

- Both original unannotated event snapshots and both supplied annotated
  snapshots produced zero alerts across three replay timestamps each.
- The known motorcycle-helmet sample still produced an alert after its second
  timestamp, with person confidence 0.916502 and helmet confidence 0.999941.
- Seven regression cases cover high classifier scores on weak person
  observations, absent/weak intervening frames, preserving person confidence,
  localized helmet support, and duplicate timestamps.
- 35 focused tests passed (19 specialty/regression and 16 inference/rule tests).
  Analytics TypeScript checking and build passed.

Replay: `node node_modules/tsx/dist/cli.mjs scratch/replay-false-helmet-snapshots.ts`.
Results: [helmet-false-alarm-replay-2026-10-03.json](helmet-false-alarm-replay-2026-10-03.json).
Original camera images stay local in `tmp/`; no replay events were submitted.

## Scope and deployment

This is a conservative evidence gate for the reproduced failures, not a
general guarantee against false alarms. Classifier-only true helmet detections
with person scores below 0.90 will also be suppressed. Wider validation across
camera views and lighting is still needed; a trained helmet localization model
would provide stronger evidence than estimated head crops.

Production was inspected read-only. No rules, historical alerts, runtime files,
or services were changed. Deploy the updated analytics image to activate the
fix. The existing helmet classifier and manifest do not need replacement.
