# Bettaih helmet-alert recurrence — 5 October 2026

Detector **1.1.9 is deployed** and addresses the new bare-head alert in
`incident-snapshot-1791202017341.jpg`, STAFF BETTAIH, camera time 17:30:40.
The screenshot exactly matches event `bb60740e-2128-4f76-9fb9-feda0379c247`,
alert `9e97dbe5-09b6-41ee-aa0a-05bd81254437`, generated at 17:30:46 IST by
detector 1.1.8. The previous deployment was active; this was a new failure
of its standard classification path.

## Cause and correction

The recorded person confidence was 0.87 with a box covering 75.2% of frame
height. This qualified for the full-person standard path. Wide head/body
crops include the dark chairs behind the bare head and can give high helmet
scores. The tighter raised and compact checks added previously do not run
when the standard crop pair already agrees.

Standard classifier-only evidence now also requires a central crop covering
40% of person width and the top 25% of its height, at the existing helmet
confidence floor. The central crop excludes lateral chair/background evidence.
This incident's score is 0.618687, below the 0.9167 floor, so it is rejected.
Contradictory central evidence clears pending confirmation and cannot retry
through the compact fallback. Accepted events retain the weakest supporting
classification confidence. Independently observed helmet boxes keep their
existing behavior; raised and compact fallback checks remain in place.

Replaying the red-box screenshot alone gives person confidence 0.67574 and
already produces no alert in the previous version. That replay would therefore
miss the live failure. Validation now also reuses recorded person boxes from
the actual incidents, rather than relying only on fresh JPEG person inference.

## Validation

- TypeScript checking and a complete build in a fresh output directory passed.
- All default-suite test behaviors were verified: the full run passed 77 of
  78 cases; the sole failure was an old assertion expecting exactly four crop
  calls instead of six. That implementation-count assertion was removed while
  retaining its repeated-confirmation behavior checks. All 21 adapter cases
  passed on recheck. Both new recurrence regressions passed in the full run.
- The candidate passed **132 isolated server replay checks** using the deployed
  models: 32 supplied/prior/control JPEG fixtures in both alert modes (64),
  and 17 originals replayed with both fresh inference and recorded person boxes
  in both modes (68).
- This new incident and all earlier supplied false-alarm scenes produced no
  helmet alerts in those checks. All three known genuine helmet controls kept
  their expected detections, including immediate fast-mode detection.
- No production events were submitted by replay. Original frames stayed on
  the server; only numeric scores and bounding boxes returned to the workstation.
- Whitespace checking passed.

Compiled detector SHA256:
`55b4018105d54fcd75a123a2c2e2d699ebbcb41ac5224e91f9bae6fe11a960f3`.

Activation recreated only analytics. Its active compiled detector matches the
validated artifact, and health reports AI_OPERATIONAL, healthy helmet inference,
operational notification submission and fast alerts enabled. Active image:
`sha256:841634c1b000e7eddc25d5949d96a2a6d58ba945db84ed729a39c553a96fb1a3`.

Rollback image:
`sentinel-gcp-analytics-engine:before-helmet-recurrence-1.1.9-20261005`.

Server validation logs, backups and activation marker:
`/tmp/sentinel-helmet-recurrence-1.1.9-20261005`.

The central crop is a conservative safeguard for this classifier, not a
general guarantee against new false positives. Partially visible or off-center
real helmets may be rejected. Historical alert records were preserved.
