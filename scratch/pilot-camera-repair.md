# Local Camera Pilot repair — 2026-10-04

Production branch: `00000000-0000-4000-8000-000000000104`.
Edge agent: `aaeda07f-01ce-4361-afd3-a54e4ca114f3`.

The wall previously admitted only two streams because the branch default live limit was four decoder units and every camera advertised only an inaccurate 1080p main profile. The branch limit is now 12. All eight DVR camera records now advertise the main and sub profiles verified against the actual DVR, and their recorder channel metadata matches the existing channel numbers.

The standalone IP camera had an invalid XM RTSP address. Its encrypted central stream source now uses the verified working format, with a separate verified substream secret. Its measured profiles are H264 2560×1440 main and H264 800×448 sub. Passwords and access permissions were preserved.

Verification:

- Nine concurrent source probes received live video packets after the repair.
- The production scheduler, using the measured profiles and a 12-unit cap, admits all nine wall feeds (9.3 decoder units even without hardware acceleration). The previous metadata and limit admit only two.
- The installed edge FFmpeg successfully transcodes DVR channel 8 HEVC to browser-compatible H264.
- A real frame from the corrected IP source shows the outdoor driveway.
- Real scene images exist on DVR channels 2, 6, 8 and the standalone IP camera.
- DVR channels 1, 3, 4, 5, 7 show black timestamp frames. The authenticated DVR VideoLoss API independently confirms those five physical inputs are disconnected (zero-based indexes 0, 2, 3, 4, 6). Restoring those pictures requires checking camera power, cable and DVR input connections.

Reload the control-room page to load the new branch stream capacity. Browser playback could not be inspected because no browser session was exposed to this task.

Changes are recorded in production `branch_protection_audit` as `camera_wall_live_repair` and `camera_wall_ip_source_repair`.

Rollback metadata is in `pilot-wall-repair-backup.json` and `pilot-ip-repair-backup.json`. The latter contains encrypted stream ciphertext only. The review scripts document the scoped production transactions; they are not intended to run again without checking current state.

## Requested 144-stream branch limit

The user subsequently requested a branch live limit of 144. The same production branch policy was changed from 12 to 144, preserving its other fields and writing a `branch_live_limit_updated` audit record. `branch-live-limit-144-backup.json` contains its prior policy.

The API validation ceiling was raised from 16 to 144. The selected branch's authorized policy now takes precedence over the dashboard's fallback tier ceiling. The workstation capacity menu includes 144; detected browser capacity and adaptive playback still determine how many streams it can actually decode. Missing tiles now display their camera name and distinguish capacity deferral, connection startup and automatic retries.

Validation passed: 28 targeted tests, dashboard TypeScript checking, and the control-plane build. Production source rollback archive and original image tags are retained on the server under `/tmp/sentinel-live-limit-144-20261004` and the `before-live-limit-144-20261004` image tags.

Deployment completed and verified at 14:59 IST: persisted branch limit 144, running API maximum 144, and deployed dashboard bundles contain the 144 capacity option, branch policy handling and accurate missing-tile text. The control plane is healthy and its public readiness endpoint returns 200. The dashboard redirects an unauthenticated control-room request to login, as expected. A browser session was not available to verify authenticated playback visually.
