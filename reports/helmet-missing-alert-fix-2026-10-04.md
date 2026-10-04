# Missed seated helmet wearer — 4 October 2026

Deployed helmet detector 1.1.5 to the analytics service on kryptovision-server.
The service reports AI_OPERATIONAL, healthy helmet inference, and operational
notification submission. No browser popup has been verified for a new live event.

The supplied `incident-snapshot-1791120703973.jpg` reproduces the miss in 1.1.3.
Person confidence is 0.829817 and its box starts at y=0.191128, below the top
of the visible helmet. It fails the existing 0.90 person floor and 0.85
full-person exception. The upper-body helmet score is 0.094549; compact crops
are 0.021055 and 0.054865. Lowering the rule threshold cannot repair this.
All 11 current pilot camera helmet-worn rules were enabled during diagnosis.
Current pilot camera IDs differ from the earlier diagnostics; the current
Channel 2 camera is `e9c975c2-2b94-4af2-a2fb-67273035091c`.
Fresh cached frames were present for 10 pilot cameras during the check.

The new fallback applies only when a person cannot use the original
classification path. It requires person confidence >=0.80, person height
>=70% of the frame, and agreement of two raised head crops >=0.98 (or the
configured threshold if higher). The region starts 15% of person height
above the person box and spans 25% of person height, using full width and
80% width. Three distinct positive timestamps must agree within the existing
120-second tracking window. Confirmation resets when the crop path changes.
Explicit contradictory helmet boxes continue to prevent classifier fallback.

The original torso/compact paths and localized-observation path remain active.
This is still crop classification, not an independently localized helmet model.
It is a limited correction for the reproduced case, not a general accuracy
guarantee. The known high-confidence bare-head false alert documented in
`helmet-alert-fix-2026-10-04.md` is not resolved by this change; existing
detection was previously retained at the user's direction.

Validation:

- All 54 focused helmet and inference tests passed; analytics typecheck and
  build passed; git whitespace check passed.
- The supplied image produces counts `[0,0,0,1]` at timestamps `[0,0,2,4]`
  seconds, confidence 0.9855518114. Duplicate timestamps do not confirm it.
- Two known wearer samples retain counts `[0,0,1,1]`.
- Five earlier false-alert snapshots remain at `[0,0,0,0]`.
- The deployed production-configured AnalyticsPipeline passed the same
  supplied-image check. This isolated replay submitted no production events.

Deployment changed only the analytics image and its persisted server source.
Image manifest: `sha256:647394576cd4cbf11f1d3fc062e38a72b462221ce667af49bfb38a7a2110a80d`.
Prior image tag: `sentinel-gcp-analytics-engine:before-helmet-raised-head-1.1.5-20261004`.
Backup and deployment marker: `/tmp/sentinel-helmet-raised-head-1.1.5-20261004`.
Activation included automatic rollback on health or pipeline replay failure.

Evidence: `helmet-missing-alert-replay-2026-10-04.json`,
`helmet-raised-head-study.json`, `helmet-raised-head-regression-replay.json`.
