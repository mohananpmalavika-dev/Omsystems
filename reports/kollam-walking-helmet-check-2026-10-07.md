# Kollam CH8 walking helmet detection

Read-only production checks on 7 October 2026 at 15:00 and 15:22 IST (09:30 and 09:52 UTC). The user identified CH8 and confirmed that detection is missed while walking.

## Production evidence

Camera `fb465a8f-5d79-4a3f-9cb8-b8cec471708d` has an enabled helmet-worn rule with minimum confidence 0.70, minimum duration 1 second, and cooldown 20 seconds. At the second check its latest cached 640×360 RGB24 frame was captured at 15:21:57 IST and had a 90-second TTL. The analytics service reported `AI_OPERATIONAL`, a healthy helmet detector, and version 1.2.2.

Production had generated helmet events and alerts: the sampled latest event occurred at 15:00:31 IST, and the latest alert was created at 14:59:44 IST. This establishes that CH8 is not entirely inactive; it does not establish that the user's walking pass was detected or that a browser popup appeared.

The running code has the same inconsistent confirmation gates as the local baseline: pending observations are pruned unless person boxes overlap at IoU >= 0.5, while confirmation accepts IoU >= 0.2 or broad frame proximity. A walking person's box can therefore match the intended confirmation gate but lose its previous observation before that matching executes.

Evidence: `tmp/kollam-walking-status-20261007.log`. No production files, rules, services, or alert records were changed by these checks. No live walking sequence was replayed.

The running compiled detector was read into `tmp/kollam-running-helmet-detector-20261007.js`. Comparing it with the freshly built local candidate shows only the intended pending-confirmation changes; the other detector behavior is identical.

## Local correction

The detector now retains, confirms, and clears pending observations using the same IoU >= 0.2 overlap gate. It selects the highest-overlap previous observation. Frame proximity without overlap no longer combines different people or clears a nearby wearer's pending confirmation when another person's helmet verification is negative.

Helmet model confidence gates, independent head verification, and the requirement for distinct capture timestamps remain as before. A negative verification or absent person still breaks confirmation. Movements with less than 0.2 overlap remain unassociated; this change does not provide identity tracking through large jumps or occlusion.

## Validation

Four newly added walking/nearby-person regression cases failed against the original detector. After the correction, all **67 tests** in the head-verification and false-alarm suites pass. These include motion in normal and fast modes, three-frame confirmation for a lower-scoring person, duplicate capture timestamps during motion, separation of nearby people, and the existing bare-head, face/pose, and negative-verification checks.

Analytics typecheck, TypeScript build, compiled detector syntax check, and whitespace checks for the two changed analytics files passed. The full workspace whitespace check still reports pre-existing trailing whitespace in the user's modified `scratch/check-recent-events.mjs`; that file was not edited for this fix.

The patch is local. Production application and a real walking-pass verification remain pending.
