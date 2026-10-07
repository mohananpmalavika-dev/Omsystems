# Kollam CH4/CH8 motorcycle helmet correction — 7 October 2026

## Confirmed failure and change

With the previous walking confirmation fix already running, the deployed
localizer labelled genuine motorcycle helmets as `head`. The verifier rejected
these observations before classification; an exposed face was another early
veto. CH4 reproduced this with fresh frames, an enabled rule, and person scores
above 0.85. Lowering the alert rule cannot correct that rejection.

Detector version 1.3.0 adds an opt-in, camera-specific complete-head classifier.
It uses frozen CLIP vision features and a locally trained linear classifier.
The localizer still establishes a real head's geometry. Both 15% and 25% padded
head crops must support helmet wearing at >=0.80; confidence is their minimum.
The person must score >=0.80 and occupy at least 35% of frame height. Clipped
heads and inferred people from background objects are excluded. Contrary head
classification cannot fall through to legacy crown crops. Visible faces do
not veto this independently classified full head.

Fast mode permits one-frame alerts at >=0.90 on both crops, so a strong wearer
does not disappear from confirmation while moving across six-second frame gaps.
Weaker evidence still requires distinct, overlapping captures. Legacy alerts
retain the stricter 0.9167 floor; the adapted floor applies only on configured
cameras. Missing configured evidence models fail closed.

`HELMET_HEAD_EVIDENCE_CAMERAS` selects Kollam CH4
`3da93c6e-6824-43dc-9bba-7332707d5856` and CH8
`fb465a8f-5d79-4a3f-9cb8-b8cec471708d`. No other camera receives this adaptation.
Alerts record the evidence model and probe checksum. The image and source/model
configuration deployment preserve the change across container recreation.

## Validation and limits

- **101 tests passed** across head verification, false alarms, specialty
  inference, and model management. TypeScript build passed.
- An exact RGB24 replay of four fresh CH4 frames generated one alert, scoring
  **0.927956**, where the deployed detector generated none. Another side view
  supported helmet wearing at 0.841258 but lacked a second overlapping capture.
  The frontal crop scored 0.796226 on the wider check and was rejected; a clipped
  near-camera frame had no usable person. This is pass-level detection, not a
  claim that every visible helmet frame is recognized.
- Nine exact RGB24 CH8 frames generated two alerts, scoring **0.982591** and
  **0.996315**. The user confirmed the black INSTA-shirt wearer had the helmet on
  in these previously ambiguous frames. These must not be counted as bare-head
  false positives. Other captures had absent/clipped or insufficient evidence.
- **19 confirmed negative images generated zero alerts** in end-to-end replay,
  including available previous false-alert originals, Rajkot hair controls,
  Hajipur controls, and a hat. JPEG controls are lossy, unlike the positive raw
  sequences. Eleven of nineteen older requested false-alert originals were
  recoverable; eight missing originals were not validated.
- Training used 12 images (52 padded head crops), including the earlier CH8
  failure and first CH4 pass as feedback. The fresh raw walking passes were not
  training inputs. The separate image evaluation used 16 images/138 crops and
  had zero positive misses or false positives at 0.80. Crop policy was refined
  during investigation, so this is engineering validation, not a blind study.

This fixes a reproduced rejection and adds a practical path for a walking
alert. It does not guarantee accuracy for every helmet, lighting condition,
view or camera. Frames still arrive roughly six seconds apart; faster capture
and broader labelled field data remain useful for weak views. Do not relax
global thresholds or treat generic `head` alone as helmet evidence.

## Evidence and deployment

- `reports/kollam-channel4-live-2026-10-07.json`: deployed baseline on fresh frames.
- `reports/helmet-head-evidence-raw-replay-2026-10-07.json`: raw walking and
  end-to-end negative replay; **zero events submitted**.
- `reports/helmet-head-probe-validation-2026-10-07.json`: crop evaluation.
- `scratch/deploy-helmet-head-evidence-20261007.mjs`: checksummed source/runtime
  and model package, retained previous image, source/config backup and rollback.

Deployment completed at approximately **17:25 IST**. Release
`20261007115503422` retained the previous image and source/configuration backup;
rollback is `/opt/sentinel-grid/helmet-head-releases/20261007115503422/rollback.sh`.
The new image is tagged both `helmet-head-20261007115503422` and `latest`.
At 17:27 IST, all six deployed runtime checksums matched the locally built
candidate, the feature model and probe checksums matched, and both camera IDs
were enabled. At 17:29:25 IST, production reported **AI_OPERATIONAL**, a healthy
helmet detector, and **version 1.3.0**.

The user's final walking test produced actual CH4 events at **17:28:17.483**
(0.9207), **17:28:23.692** (0.9325), and **17:28:49.142** (0.9832), with two new
application alerts created at 17:28:18 and 17:28:50 IST. CH8 also produced new
version 1.3.0 events and a new alert. Production event metadata identifies
`helmet-head-evidence` and the deployed probe checksum. Original evidence
images from all three CH4 events and the latest sampled CH8 event were visually
checked: they show the real helmet wearer walking, including rear and side
views, rather than seated staff or the spare helmet on a chair.

Sparse isolated samples during the same final pass still contained rejected
helmet views with insufficient scores. The isolated reader did not sample the
exact frames that produced the production events. Accordingly, live alert
generation is confirmed, but per-frame recall is not perfect. No replay data
was posted into the alert pipeline.

Production proof: `reports/kollam-head-evidence-release-2026-10-07.json`,
`reports/kollam-head-evidence-production-status-2026-10-07.log`, and
`reports/kollam-head-evidence-live-alerts-2026-10-07.json`. The immutable initial
raw validation pass is
`reports/kollam-channel4-walking-raw-validation-2026-10-07.json`; the final sampled
live pass is `reports/kollam-channel4-final-live-validation-2026-10-07.json`.

## Subsequent global enablement

After confirming the fix was working, the user requested enabling it for all
cameras. Version **1.3.1** was deployed with `HELMET_HEAD_EVIDENCE_CAMERAS=*`,
covering existing and future cameras with helmet rules. At 17:52:37 IST the
service was healthy and AI_OPERATIONAL, and deployed checksums matched the
tested build. See `reports/helmet-head-evidence-all-cameras-2026-10-07.md`.
The earlier two-camera scope in this report describes the initial rollout.
