# Recording playback investigation — 4 October 2026

The screenshot selected Local Camera Pilot / CP PLUS DVR Channel 7. Its address bar still referred to a different branch and Channel 2. The Channel 2 branch's public edge relay was offline (`503 edge_media_offline`). The pilot Channel 7 recorder was reachable through the current edge agent, version 0.1.48.

For pilot camera `fa884a52-2378-4981-9c09-4620c12a9de5`, authenticated recorder archive search returned seven clips for a one-hour window. A 30-second playback request returned HTTP 201; the HLS manifest and media request returned HTTP 200. The manifest advertised H.264 (`avc1.640020`). Test grants and the temporary diagnostic login session were cleaned up.

The recording page's main button previously loaded only indexed recordings. It did not query footage on the recorder HDD or camera SD card. The main **Search recordings** action now queries both sources independently, so a missing or unavailable recording index does not prevent device clips appearing. Selecting a device clip starts authenticated HLS playback.

Changing branch, camera, or time range clears old results and playback. Late responses from an earlier selection are ignored; any late playback session is closed. Playback sessions are also released when replaced or when the workspace unmounts. Both search actions validate the time range before requesting device access. An offline relay has a useful error message, and the player displays preparation and stream error states.

Validation: dashboard type checking and 40 recording checks passed, including four Chromium workflow tests and existing recording proxy, recorder probe, and edge gateway tests. `git diff --check` passed for this change.

Deployed to the live GCP dashboard on 4 October 2026 at 17:31 UTC (23:01 IST). Dashboard image: `sha256:2b27e9289788ed6fb46f2ae8d3a51f5430ffda43db4851beb6fdba4f13bcc61c`. Dashboard health returned HTTP 200.

The live public recording page was verified in Chromium using a temporary diagnostic login session. The main **Search recordings** action returned 144 Channel 7 device clips for the preceding 24 hours. Selecting the first clip produced decoded video: 960 × 1080, readyState 4, 32 decoded frames, and playback advancing beyond two seconds. Switching to Channel 8 removed the player and released the old playback session with HTTP 200. No browser page errors were reported. The temporary diagnostic login session was removed after the check.

To use the fix, refresh the recording page, choose the branch, camera and time range, click **Search recordings**, and select a result under **Device clips**. Branches whose edge gateway is offline still require that gateway to reconnect before their local footage can be searched or played.

## Black-picture follow-up, 4 October 2026

The earlier Channel 7 browser check proved video delivery and decoding, but did not verify that the scene contained a visible camera image. The user's screenshot exposed this limitation. Direct image inspection now confirms that both Channel 7's current DVR snapshot and its archived footage at 09:10 IST contain a black scene with the DVR timestamp and CAM7 overlay.

The recorder at `192.168.29.170` reports active `VideoLoss` event indexes `0, 2, 3, 4, 6`. These indexes are zero-based; index 6 corresponds to physical Channel 7. The saved pilot camera `fa884a52-2378-4981-9c09-4620c12a9de5` has inventory channel 7, recorder channel 7, and an authorized RTSP source using `channel=7`. The channel mapping is consistent. Sampled Channel 7 privacy cover settings were disabled. The cause is loss of the camera input at the recorder, rather than failure to decode its stream in the browser.

Direct snapshots and recordings from physical Channels 6 and 8 contain visible scenes. Diagnostic images are saved under `scratch/black-recording-20261004/`. Channel 7's camera power, cable/connector and DVR input must be checked on site to restore its picture. The sampled black recording contains no scene image to recover through a playback software change.

The live public recording page was rechecked on Channel 6 (`62bbfb5c-9a72-48d0-8127-292afcf8466c`). It returned 144 clips for 24 hours, decoded 30 frames at 960 × 1080, and advanced beyond two seconds. Its browser screenshot was visually inspected and shows the recorded room with the CAM6 overlay. Switching camera released the session with HTTP 200; the temporary diagnostic login was removed.
