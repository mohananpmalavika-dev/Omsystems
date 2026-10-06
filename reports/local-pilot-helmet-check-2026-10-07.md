# Local Camera Pilot helmet check

Checked on 7 October 2026 at 00:52 IST (2026-10-06T19:22:09Z). No deployment, application file replacement, service restart, rule change, or alert submission was performed by this diagnostic run.

## Latest production result

Production created these `Helmet worn detected` alerts:

| Channel | Created at, IST on 7 October | Confidence | Alert ID | Status at check |
| --- | --- | --- | --- | --- |
| CH2 | 00:45:23 | 98.05% | 15c24fc3-bfaa-4431-9bc0-3bb2489140dd | escalated |
| CH8 | 00:47:01 | 96.02% | 5e74f29c-5640-425b-8b63-54259d8cc139 | escalated |
| CH2 | 00:48:21 | 99.99% | 1ff496b9-cb78-4f40-9f25-47330b126e00 | new |
| CH6 | 00:48:34 | 99.23% | 95608dce-862e-45a2-8d1f-cc1ba1a38fd0 | escalated |

All four associated `analytics_notifications` records have channel `dashboard` and status `delivered`. Recent command-center requests returned HTTP 200. These are server delivery records; they do not establish that the user's particular browser rendered a popup or played audio. No recipient or identity data was collected.

Evidence: `tmp/pilot-alert-delivery-20261007.log`. Helmet rules are enabled, unarchived, with minimum confidence 0.70, minimum duration 1 second, and cooldown 60 seconds. The session-lifetime fix is present in the running analytics service. At 00:50:38 IST the previous 10 minutes contained no HTTP 500 responses or `Session already disposed.` errors in the checked analytics logs.

## Isolated captured-frame investigation

Visually confirmed helmet wear in cached CH2 and CH6 frames captured at 00:45:58 and 00:45:52 IST. A separate AnalyticsPipeline process processed actual raw RGB24 frames and submitted zero events. It recognized the person at confidence 0.6153 on CH2 and 0.7552 on CH6, but independent helmet verification returned null for both samples. Later naturally distinct samples showed empty chairs after the person left those views. This sequence did not establish consecutive positive confirmation and does not disprove the production alerts from other frames.

Evidence: `reports/pilot-pipeline-wearer-20261007.json` and corresponding local JPG snapshots in `tmp/pilot-wearer-*`. Replays of the saved JPEGs are lossy and must not be treated as exact replays of the raw frames. The JPEG replay verified the CH2 head at confidence 0.9563; CH6 found only a `head` label and a visible face at confidence 0.7621, triggering the existing face-without-helmet-shell veto before classification. This suggests a remaining sensitivity to model localization and transparent/open visor views, but does not justify relaxing thresholds from these samples alone. Earlier visually bare-headed samples also received high helmet classification scores.

The latest result is that production detection and server dashboard dispatch succeeded. Visibility of the notifications in the user's browser remains unverified.
