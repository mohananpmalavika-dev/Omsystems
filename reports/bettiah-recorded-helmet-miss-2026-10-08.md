# Bettiah recorded helmet entry, 8 October 2026

The reported helmet wearer is confirmed in Channel 5 recording. The database contains no detection events or alerts for Channels 2 and 5 between 10:05 and 10:11 AM IST. Both helmet-worn rules are enabled (confidence 0.70, duration 1 second, cooldown 20 seconds). The missed Channel 5 alert is real.

The actual DVR overlays identify a man in a light blue shirt carrying a black helmet at Channel 2's entrance at 10:07:31 AM. Channel 5 shows him wearing it at 10:08:11 AM and seated wearing it at 10:08:21 AM. Carrying a helmet is different from the configured helmet-worn condition. Channel 2's sampled entrance frame does not establish a worn-helmet alert violation.

Read-only production log review from 10:05 through 10:11 found no Session already disposed errors and no matching HTTP 500/frame-processing failures. That does not support the concurrently written restart explanation for this specific interval. General service health alone does not prove every camera frame reached inference.

Recordings were retrieved through the existing configured owner's recording:view access checks and short-lived playback grants. Playback required the CP PLUS/Dahua archive protocol. The first MP4 captures were incomplete when the recorder failed to close its stream. A MPEG-TS retry yielded approximately 113 seconds, 960x540 H.264. Frame extraction produced 56 Channel 2 and 57 Channel 5 images, sampled every two seconds. Some frames contain decoder corruption. Capture does not establish complete coverage of the final seconds of the requested 10:07–10:09 window. No production rules, credentials, camera mappings or service processes were changed by this investigation.

Offline replay tested 12 distinct Channel 5 frames at 640x360 and again at recording resolution. These are downscaled recorder frames, not the missing historical analytics captures. Their nominal timing uses video PTS; quoted incident times above were read from actual DVR overlays. The deployed detector and four relevant runtime modules matched local SHA-256 fingerprints before replay. Another process rebuilt and deployed the detector during this investigation, so this replay tests the current runtime, not a frozen copy of the 10:07 runtime.

Replay results: 640x360: 5/12 frames produced offline helmet-worn results; 960x540: 6/12 frames produced offline helmet-worn results. The current runtime rejects the earlier walking images and recognizes several seated images. Zero production events were submitted. This is evidence of a walking recognition limitation and current seated recognition; it is not proof of the precise historical failure or a verified live fix.

The exact original cause remains unresolved. It requires the original analytics inputs or equivalent timestamped gateway delivery/inference evidence. The camera-specific lines in the separate frame-requests diagnostic are live-wall reads, not proof of frame uploads. They must not be presented as analytics arrival cadence.

Evidence:
- reports/bettiah-entry-diagnostic-2026-10-08.json
- reports/bettiah-entry-analytics-errors-2026-10-08.json
- reports/bettiah-entry-production-runtime-2026-10-08.json
- reports/bettiah-entry-helmet-replay-2026-10-08.json
- reports/bettiah-entry-helmet-replay-summary-2026-10-08.json
- scratch/bettiah-entry-20261008/ch2/frame-015.jpg (10:07:31, carried helmet)
- scratch/bettiah-entry-20261008/ch5/frame-035.jpg (10:08:11, worn helmet)
- scratch/bettiah-entry-20261008/ch5/frame-040.jpg (10:08:21, seated worn helmet)
