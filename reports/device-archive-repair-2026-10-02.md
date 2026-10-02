# Device archive search repair — 2 October 2026

The Recording playback page failed to list footage from Local Camera Pilot's CP PLUS DVR at `192.168.29.171`. This is separate from HDD-capacity telemetry, repaired in gateway 0.1.43.

## Live findings and implemented fix

- The DVR's `mediaFileFind.cgi?action=factory.create` returns `result=<numeric handle>`, rather than `object=<handle>`. Archive search and recent-recording probes now accept both numeric variants and reject non-handle results.
- Its CGI rejects form-style `+` spaces in search timestamps. These requests now use `%20`.
- The saved recorder inventory has zero-based channels, while search and playback use the one-based channel in the authorized RTSP stream URI. The storage gateway uses that stream channel for Dahua-style URLs, preserving the existing mapping for other URLs. No camera mappings or credentials were changed.

## Verification

- The repaired source code returned **144 ten-minute clips** for Channel 1 from **1 October 2026, 22:10 IST to 2 October 2026, 22:10 IST**, exactly matching the screenshot range.
- A read-only RTSP probe of the first returned clip succeeded: **H.264, 1280 × 720**.
- **33 tests passed** across recorder-probe and edge-live-gateway tests, including OEM handle format, timestamp encoding, existing API fallbacks, recording authorization, and zero-based inventory channels 0 and 3 using playback channels 1 and 4.
- Edge-agent typecheck and `git diff --check` passed.
- Windows gateway **0.1.44** was packaged and passed isolated native-runtime/package and version smoke checks.
- Executable SHA-256: `6A3F11CD27128CBEDA7E2EAC609286844B1E8BFA8D46F9237C8B55451A7F9F47`.

## Deployment

The user explicitly approved installing 0.1.44 and restarting Local Camera Pilot. Installation completed through normal Windows administrator elevation. The installed executable hash matches the verified release, gateway health returned `status: ok`, and its registration log at **22:29:08 IST** reports **0.1.44**. The DVR archive search and H.264 playback probe succeeded again after the restart.

The installer verifies old/new executable hashes, backs up the executable and configuration, updates only this installation, restarts its scheduled task, and rolls back if the gateway health check fails. Task Scheduler queued the first restart instead of launching the gateway, so that attempt restored the old executable. The installer now starts the same installation directly if the task does not become healthy and no gateway process exists. The successful retry used this fallback; its result is recorded in `tmp/storage-install-0.1.44.json`. The scheduled task remains enabled; its launch-condition issue has not been separately repaired or reboot-tested.

No recordings were deleted or disks formatted. The dashboard browser session was unavailable for UI verification. Live verification above establishes device archive search and the returned RTSP video stream; browser HLS delivery was not separately verified. This repair has not been deployed to other branches.
