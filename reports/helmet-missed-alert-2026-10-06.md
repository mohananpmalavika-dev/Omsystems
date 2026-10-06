# Bettaih Channel 5 missed helmet alert

Read-only diagnosis at 17:35–17:39 IST, 6 October 2026:

- Current camera: `172e5dd2-6c2e-4946-b0a3-8f40b85d7319`, branch `d7b23dee-9814-48c9-8805-48b61b33e3a9`.
- The helmet-worn rule is enabled, minimum confidence 0.70 and duration 1 second.
- Running detector: 1.2.0. AI and helmet model health are operational; notification submission reports operational.
- No camera detection events or helmet alerts were recorded in the two-hour query window. Frame-cache TTL was 38 seconds, confirming an unexpired camera frame is present. Frame contents were not retrieved.
- Running code fingerprints confirm helmet-only head candidates, the overlapping-head veto, and localized confirmation falling through to body classification.
- The health `received` field counts generated events, not incoming frames; it must not be interpreted as a frame-delivery counter.

## Local correction: detector 1.2.1

Head-localizer observations labelled `head` are accepted only when independently classified full-head and surrounding-context crops both meet the existing helmet threshold. Generic head observations cannot retry crown strips. The exposed-face crown alternative still requires a separately helmet-labelled localization with usable source pixels. An overlapping generic head label no longer vetoes this independent helmet observation by itself.

Verified localized candidates now retain their pending consecutive confirmation without falling through to estimated body crops. Negative verification still clears confirmation; duplicate timestamps cannot advance it. The localized path requires two distinct verified frames in fast mode, and two or three in normal mode according to person confidence.

## Validation and limits

- All 50 focused head-verification and false-alert tests pass, including regressions reproduced failing before the fix.
- Analytics typecheck, a fresh compiled build, JavaScript syntax checks, and whitespace checks pass.
- Isolated local ONNX replay passes 10 checks: two genuine helmet fixtures and three bare-head false-alert fixtures in both alert modes. Both genuine fixtures were missed by the baseline and are now detected after distinct verified frames. All three negative fixtures remain suppressed.
- Sixty older replay cases are skipped because their 30 original images are no longer available at the recorded paths. This is not a complete rerun of the earlier 35-image corpus.
- The specialty-inference suite has three pre-existing failures; a separate HEAD-baseline run reproduces the same three failures. They concern observed helmet boxes and are outside this change.
- The newly attached live screenshot has not been replayed through ONNX. The read-only checks establish configuration and code defects, not an exact frame-level explanation for that particular image or proof of a new live popup.

The code-only package contains two TypeScript source files and their compiled JavaScript. It contains no camera pictures, recordings, models, credentials, or private event exports.

## Server status

No server changes have been made. User authorization covers read-only diagnostics. Applying detector 1.2.1 requires permission to update the two analytics files and recreate only the analytics service, with a backup image for rollback. Live alert verification remains pending.
