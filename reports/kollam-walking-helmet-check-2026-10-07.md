# Kollam CH8 walking helmet detection

Read-only production checks on 7 October 2026 at 15:00 and 15:22 IST (09:30 and 09:52 UTC). The user identified CH8 and confirmed that detection is missed while walking.

## Production evidence

Camera `fb465a8f-5d79-4a3f-9cb8-b8cec471708d` has an enabled helmet-worn rule with minimum confidence 0.70, minimum duration 1 second, and cooldown 20 seconds. At the second check its latest cached 640×360 RGB24 frame was captured at 15:21:57 IST and had a 90-second TTL. The analytics service reported `AI_OPERATIONAL`, a healthy helmet detector, and version 1.2.2.

Production had generated helmet events and alerts: the sampled latest event occurred at 15:00:31 IST, and the latest alert was created at 14:59:44 IST. This establishes that CH8 is not entirely inactive; it does not establish that the user's walking pass was detected or that a browser popup appeared.

At those initial checks, the running code had the same inconsistent confirmation gates as the local baseline: pending observations were pruned unless person boxes overlapped at IoU >= 0.5, while confirmation accepted IoU >= 0.2 or broad frame proximity. A walking person's box could therefore match the intended confirmation gate but lose its previous observation before that matching executed.

Evidence: `tmp/kollam-walking-status-20261007.log`. No production files, rules, services, or alert records were changed by these checks. No live walking sequence was replayed.

The running compiled detector was read into `tmp/kollam-running-helmet-detector-20261007.js`. Comparing it with the freshly built local candidate shows only the intended pending-confirmation changes; the other detector behavior is identical.

## Local correction

The detector now retains, confirms, and clears pending observations using the same IoU >= 0.2 overlap gate. It selects the highest-overlap previous observation. Frame proximity without overlap no longer combines different people or clears a nearby wearer's pending confirmation when another person's helmet verification is negative.

Helmet model confidence gates, independent head verification, and the requirement for distinct capture timestamps remain as before. A negative verification or absent person still breaks confirmation. Movements with less than 0.2 overlap remain unassociated; this change does not provide identity tracking through large jumps or occlusion.

## Validation

Four newly added walking/nearby-person regression cases failed against the original detector. After the correction, all **67 tests** in the head-verification and false-alarm suites pass. These include motion in normal and fast modes, three-frame confirmation for a lower-scoring person, duplicate capture timestamps during motion, separation of nearby people, and the existing bare-head, face/pose, and negative-verification checks.

Analytics typecheck, TypeScript build, compiled detector syntax check, and whitespace checks for the two changed analytics files passed. The full workspace whitespace check still reports pre-existing trailing whitespace in the user's modified `scratch/check-recent-events.mjs`; that file was not edited for this fix.

At completion of the initial investigation, the patch was local and production application was pending. The user subsequently reported publishing it; the follow-up below supersedes that deployment status.

## Follow-up after the user's publish, 15:51–15:55 IST

The running compiled helmet detector is now identical to the locally built walking-fix candidate. Its old strict pruning and broad proximity matching are absent. The service reports `AI_OPERATIONAL` and a healthy helmet detector. The rule remains enabled. Fresh frames continue arriving. At the 15:51 IST query, the latest recorded CH8 helmet event was still from 15:00:31 IST.

An isolated process inside the analytics container processed distinct cached raw RGB24 frames using the deployed detector, deployed model files, and current environment. It submitted **zero** events to the application. Its configured helmet threshold was 0.75, fast mode was enabled, and both face and pose inference providers loaded. Detector alert verification still applies its internal minimum of 0.80.

The first sequence included a person at confidence 0.8451 whose head was entirely outside the top of the image. No head or helmet was localized. This explains that particular near-camera sample, but does not explain all misses.

The second sequence captured an unmistakable helmet wearer with the entire helmet visible at **15:55:17 IST**. Person confidence was **0.9152**. The deployed head localizer returned only label **`head`**, confidence **0.7682**, and no `helmet` box. Face detection found the exposed face at confidence 0.7639; pose inference returned no poses. The verifier rejects head-only observations, including via its face-without-helmet-shell gate. **No classifier calls were made, no pending confirmation was retained, and no helmet result was produced.** A later rear-facing wearer at 15:55:25 IST was also labelled only `head` (0.3614) and produced no result. Other near-camera samples had the head clipped or absent from localization.

This directly reproduces a remaining helmet-localization false negative with the walking fix already active. Lowering the rule or person-confidence threshold cannot bypass a verifier rejection before classification. The visible wearer must not be described as bare-headed merely because the model emits `head`.

Evidence:

- `reports/kollam-walking-live-first-2026-10-07.json`: first raw-frame inference trace and near-camera snapshot references.
- `reports/kollam-walking-live-2026-10-07.json`: second raw-frame inference trace, distinct capture timestamps, and per-frame JPEG preview references.
- `tmp/kollam-live-fb465a8f-5d79-4a3f-9cb8-b8cec471708d-20261007102517107.jpg`: fully visible helmet preview.

Separate exploratory **JPEG** studies tested a person-head crop with the current localizer and three already downloaded alternative localizers on ten available images (two new wearer previews, two older controls, and six negative fixtures). The current model still labels the new wearer `head` after cropping; the alternative models did not establish a usable localized helmet on the new frontal wearer. Tight crop classification can score nearly 1.0 for both genuine helmets and recorded hair false alarms, so accepting `head` or removing context checks is not established as a reliable correction by these results. These are lossy preview studies, not exact raw-frame replays or a complete validation of the older corpus.

Study artifacts: `reports/kollam-localization-study-2026-10-07.json` and `reports/kollam-alternate-localizers-2026-10-07.json`.

No additional production code, model, rule, alert record, or service was changed during this follow-up. Only temporary diagnostic scripts were written remotely. **The localization miss remains unresolved; a suitable motorcycle-helmet localizer and validation against genuine and bare-head examples are still required.**
