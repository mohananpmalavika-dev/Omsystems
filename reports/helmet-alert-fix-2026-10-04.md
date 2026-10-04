# Pilot helmet alert repair — 4 October 2026

The live service already ran detector 1.1.1 and the motorcycle helmet model;
all pilot helmet-worn rules were enabled. The missed seated wearer was
reproduced with the live CH6 frame. Person confidence was 0.9065, but the
upper-body and 35%-height head crops scored only 0.0049 and 0.0920 for helmet.
Visual inspection confirmed that the wearer had a helmet. The broad crops
included too much torso for this head classifier.

Detector 1.1.3 adds a fallback pair of compact head crops: the top 15% of the
person box, using full person width and 80% person width. Both must exceed
the existing 0.9167 floor. Classifier-only evidence still requires independent
person confidence of at least 0.90 and confirmation at two distinct timestamps.
The live test exposed a second rejection: a visible wearer in CH2 had person
confidence 0.8600 while both original helmet crops exceeded 0.9999. A new
conservative path accepts a person score of at least 0.85 only when its box
occupies at least 75% of the frame height, and requires three consecutive
positive timestamps. Scores below 0.85 and smaller boxes do not qualify.
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
- All 61 tests in the analytics default test suite passed for the crop change, including new
  compact-crop agreement and duplicate-timestamp regressions. Analytics
  typecheck, build, and git whitespace checks passed. After the three-frame
  path was added, all 50 focused inference/helmet tests passed, including two
  additional gate regressions. Build and the six-image replay also passed.

Static-image replay evidence is in `helmet-compact-replay-2026-10-04.json`;
crop comparisons are in `helmet-crop-study-2026-10-04.json`. Diagnostic replays
did not submit events to production.

## Deployment

Detector 1.1.3 was deployed into the analytics image on kryptovision-server.
Only the analytics service was recreated. Its helmet detector, notification
submitter and AI_OPERATIONAL health checks passed. The server source was also
updated so an analytics rebuild retains the fix.

Prior image: `sentinel-gcp-analytics-engine:before-helmet-compact-1.1.3-20261004`.
Source, detector and original image references are backed up under
`/tmp/sentinel-helmet-compact-1.1.3-20261004`. The deployment script includes rollback
on failed activation. The new image manifest is
`sha256:85977f83e8aaf8799e2046fb44ee0cf5a640e55da1464db130daa1c79344ebdd`.

The complete production-configured pipeline was replayed with the captured
CH2 wearer image. It produced zero events at timestamps 0 and 2 seconds, then
a `helmet-worn` event at 4 seconds with confidence 0.9999982. This replay was
isolated and did not submit events. Effective production thresholds were
object 0.35 and helmet 0.88, with the detector's independent-person gates.

## Live verification

A real CH2 helmet-worn event was accepted at 2026-10-04 10:18:45.197 UTC
(15:48:45 IST), confidence 0.9987. This was live detection, not replay.
Event ID: `11647f53-cae0-40a7-80d6-a55eb5ed0f7e`.
The P2 "Helmet worn detected" record in `analytics_alerts` is
`38b5c902-2af9-474e-867a-a80393c7c2fa`, created at 10:18:46.595361 UTC.
Its dashboard notification `6e8c0516-a54c-41b4-a140-b2696c6d9310`
has status `delivered`, attempts 1, created at 10:18:46.649258 UTC.
Delivery status verifies server dispatch; it does not establish that a
browser displayed the popup or played audio.

The gateway stays online but
fresh camera frame delivery is intermittent; cache entries sometimes expire
and later recover. A `collect-logs` command was queued for the pilot gateway
to investigate this. Its returned logs confirmed repeated capture failures
and overlapping analytics cycles. A signed pilot-only application update
0.1.48 was prepared. Its source change preserves the configured main RTSP source
instead of forcing the 352x288 substream, and backs off an unsuccessful
analytics capture for 60 seconds per camera. Camera health probes continue.
All 11 focused edge heartbeat/RTSP tests and edge TypeScript checking passed;
the generated bundle's import/entrypoint check passed. No fleet release was
enabled. Administrator activation was attempted, but the packaged launcher
could not resolve `onnxruntime-node` when loading the external delta. The
launcher rejected/quarantined the active marker. The original 0.1.47 agent
was restarted and confirmed online at 10:40:48.250502 UTC. The failed hosted
bundle was quarantined. The capture changes are tested source changes only;
they are not active on the pilot gateway.
No analytics event delivery failures were reported by
the analytics service on the checks so far. This crop change has limited
camera validation; it is not a general accuracy guarantee. Weak person
observations and unsupported helmet angles can still miss wearers.

## Fullscreen popup repair

The video wall requests browser fullscreen on its own element. Global alert
overlays were rendered outside that element, so the browser could hide them.
`FullscreenAlertPortal` now places the complete alert UI in the active
fullscreen element and returns it to the document body on fullscreen exit.
It also supports single-camera fullscreen. Chromium verification exercised
real wall and tile fullscreen, alert interaction, and return to normal view,
with no browser errors. All three existing alert queue tests passed.
Dashboard deployment/health verification is pending.
