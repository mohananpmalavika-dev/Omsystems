# Recording Retention Acceptance

The platform can calculate continuous retention from its own segment index and can scan Hikvision ISAPI and Dahua/CP PLUS native archives. Parser fixtures and unit tests are not hardware certification.

## What the acceptance gate proves

Run `npm run test:recorder:compatibility` with `TEST_CONFIG` pointing to a private configuration derived from `test/hdd-health/config.example.json`.

For each exact recorder model and firmware, the run now requires:

- an explicit camera-to-recorder-channel mapping for every expected channel;
- `expectedRetentionDays` of at least 180 and a native archive lookback at least that long;
- a complete, non-truncated archive scan for every mapped channel;
- at least 180 continuous days between the oldest and newest playable media;
- no gap larger than the configured continuity tolerance;
- newest playable media within that tolerance at scan time.

The generated `hdd-compatibility-evidence-YYYY-MM-DD.json` includes the per-channel archive timestamps, gap counts, completion flags, model, firmware, and every pass/fail gate. Store that artifact in the deployment evidence system; generated local reports are gitignored because they can contain site identifiers.

## Scaling behavior

Operational dashboards and reports use `loadBatchedRetentionInputs`. It reads recording jobs once, computes the longest effective policy window, then reads all authorized camera segments once for that bounded interval. It no longer executes one segment query per camera. The batch helper is exercised with 2,000 camera IDs in the automated suite.

## Remaining field work

No deployed Hikvision, Dahua, or CP PLUS recorder is marked certified in this repository. Each exact model/firmware pair must pass the command above on site with all production channels mapped. A fixture-only pass must never be entered in the compatibility matrix as hardware evidence.
