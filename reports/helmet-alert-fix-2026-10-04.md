# Pilot helmet alert repair — 4 October 2026

The live service already ran detector 1.1.1 and the motorcycle helmet model;
all pilot helmet-worn rules were enabled. The missed seated wearer was
reproduced with the live CH6 frame. Person confidence was 0.9065, but the
upper-body and 35%-height head crops scored only 0.0049 and 0.0920 for helmet.
Visual inspection confirmed that the wearer had a helmet. The broad crops
included too much torso for this head classifier.

Detector 1.1.2 adds a fallback pair of compact head crops: the top 15% of the
person box, using full person width and 80% person width. Both must exceed
the existing 0.9167 floor. Classifier-only evidence still requires independent
person confidence of at least 0.90 and confirmation at distinct timestamps.
The snapshot annotation uses the compact region when that fallback succeeds.
Localized helmet observations and the original successful crop path retain
their existing behavior.

## Verification

- The captured seated CH6 image alerts after the second distinct replay
  timestamp at confidence 0.957528. A repeated identical timestamp does not
  alert. The previously known wearer image still alerts at 0.999941.
- The two original chair/bare-head false-alarm snapshots still produce zero
  alerts. Their person observations remain below the independent-person floor.
- The CH2 bare-head capture produces zero alerts. CH8's helmet wearer is also
  suppressed because its person score is only 0.7701; this fix does not remove
  that conservative limitation.
- All 61 tests in the analytics default test suite passed, including new
  compact-crop agreement and duplicate-timestamp regressions. Analytics
  typecheck, build, and git whitespace checks passed.

Static-image replay evidence is in `helmet-compact-replay-2026-10-04.json`;
crop comparisons are in `helmet-crop-study-2026-10-04.json`. Diagnostic replays
did not submit events to production.

## Deployment

Detector 1.1.2 was deployed into the analytics image on kryptovision-server.
Only the analytics service was recreated. Its helmet detector, notification
submitter and AI_OPERATIONAL health checks passed. The server source was also
updated so an analytics rebuild retains the fix.

Prior image: `sentinel-gcp-analytics-engine:before-helmet-compact-20261004`.
Source, detector and original image references are backed up under
`/tmp/sentinel-helmet-compact-20261004`. The deployment script includes rollback
on failed activation. The new image manifest is
`sha256:f00f80ba05871dc77c0e99a3527b12bb854703d0559d1689fbad441f0a1a64f4`.

Live event/alert verification is in progress. This crop change has limited
camera validation; it is not a general accuracy guarantee. Weak person
observations and unsupported helmet angles can still miss wearers.
