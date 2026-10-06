# Rajkot recurring helmet false alerts — deployed correction

Detector **1.2.2** was activated on 6 October 2026 at **18:46:32 IST**. The production source files and running compiled files match the reviewed package. AI inference, helmet detector health, and notification submission are operational.

## Cause and correction

The server's original Rajkot events identified `localized-head-classification` from detector 1.2.1 as the evidence source. Both the head localizer and motorcycle helmet classifier confused this seated person's dark hair with a helmet. Repeated observations therefore confirmed a consistent false positive.

Tight head and 15% context crops could score above 99% on bare hair. The crown fallback could also override a failed whole-head check with a near-certain isolated hair crop. Raising the alert confidence alone would not distinguish these cases.

The whole-head path now additionally requires classification agreement in a surrounding crop padded by 75% of the localized head dimensions. A failed surrounding check rejects that candidate without retrying its crown. The exposed-face alternative still requires an independently helmet-labelled localization; its crown must also agree with a crop including the shell boundaries, padded horizontally by 30% and vertically by 15% of the original head dimensions. Alert confidence retains the weakest supporting classification score. Existing person gates and distinct-frame confirmation are retained.

The correction applies across cameras without disabling helmet rules or excluding Rajkot. The Rajkot helmet-worn rule remains enabled.

## Validation

- **54 focused tests passed**, including regression cases for tight bare-hair crops and the crown fallback.
- **22 local ONNX replay checks passed**: the three supplied screenshots, three original Rajkot frames, three earlier negative fixtures, and two genuine helmet fixtures, each in both alert modes. Negative fixtures reject head verification as well as alert generation. Both genuine helmet fixtures retain distinct-frame detection.
- **All seven original Rajkot event frames passed** isolated validation with the production server's models before activation. No replay events were submitted to the live event pipeline.
- Typecheck, a fresh compiled build, JavaScript syntax checks, package hashes, and whitespace validation passed.
- The broader analytics suite reported **117 passed / 4 failed** after increasing timeouts for model initialization. A run loading the HEAD versions of both helmet files reproduced the same four failures in the specialty and shutter suites (**34 passed / 4 failed**). These failures are outside the modified localization path.
- An older replay script passed its 10 available cases; 60 cases were skipped because their original images were unavailable. The new 22-case replay above has no skips.

## Deployment and remaining live check

Only the analytics service was recreated. The previous image is retained as `sentinel-gcp-analytics-engine:before-helmet-rajkot-1.2.2-20261006`. Both server source files were updated so the correction survives a rebuild. The activation script includes rollback if startup health checks fail.

The final server check at **18:56:38 IST** confirmed version 1.2.2 and operational health. No new Rajkot helmet events or alerts were recorded after deployment. However, Rajkot had no current shared-cache frame, and the edge agent's latest recorded heartbeat was **18:33:40 IST**, before deployment. Inventory still reported online, so that label alone does not establish a fresh feed. The isolated fresh-frame check stopped because no current frame was available.

**Fresh live-frame verification remains pending until Rajkot sends analytics frames again.** The absence of new alerts during this interval is not proof of live accuracy. The validated evidence establishes that the reported snapshots and seven original false-alert frames are rejected by the deployed code; it does not guarantee zero future model errors in all scenes.

Files changed: `analytics-engine/src/inference/helmet-head-verification.ts`, `analytics-engine/src/detectors/helmet-detector.ts`, and `analytics-engine/test/helmet-head-verification.test.ts`.

Replay details: `reports/helmet-rajkot-fix-validation-2026-10-06.json`. The deployment package contains code and a read-only validation script; it contains no camera images, model binaries, or credentials.
