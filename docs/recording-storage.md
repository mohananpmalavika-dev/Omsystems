# Recording and storage module

The recording engine is independent of live viewing. It receives camera policy
from the control plane, resolves the camera secret locally, and runs FFmpeg even
when no operator has a live session open.

## Implemented pipeline

```text
Camera / RTSP-capable NVR or DVR
  -> recording-engine (FFmpeg stream copy)
  -> 10-300 second MP4 segments (60 seconds by default)
  -> time-based local path
  -> SHA-256 evidence checksum
  -> control-plane playback index
  -> legal-hold-aware retention cleanup
```

The recorder persists job configuration in the recording volume, automatically
restarts failed FFmpeg workers with backoff, reports health failures, retries
failed index callbacks through durable sidecar files, and publishes storage
capacity health to the control plane.

## Retention policy

Each camera has independent policy for:

- continuous, scheduled, motion, event, or manual recording;
- total retention and hot, warm, and cold tier durations;
- segment duration and maximum planned bitrate;
- critical-camera and backup classification;
- automatic deletion eligibility;
- evidence protection and legal holds;
- main-stream recording versus lower-bandwidth viewing.

The default banking policy is 180 days (30 hot, 60 warm, 90 cold). It is a
configurable institutional policy, not a claim that every camera is subject to
a universal RBI 180-day rule. The approved security policy and applicable
regulatory, contractual, privacy, and evidence requirements remain authoritative.

Warm/cold tier metadata, storage-node capabilities, and replication jobs are in
the database. Moving bytes to a specific NAS, SAN, object store, or cloud archive
requires the adapter for that destination; the local recorder currently writes
the primary copy and executes approved retention deletion.

## Capacity calculation

For bitrate in Mbps, decimal TB is:

```text
raw TB = bitrate × 3,600 × hours/day × days × cameras / 8 / 1,000,000
```

The API calculator separately reports metadata/index overhead, safety reserve,
RAID overhead, primary raw capacity, and backup capacity. RAID is never counted
as a backup.

Example: 20 cameras, 2 Mbps, 24 hours/day, 180 days:

- raw video: 77.760 TB;
- primary usable with 15% metadata/index overhead: 89.424 TB;
- primary raw capacity at 75% RAID usable efficiency: 119.232 TB;
- one separate backup copy: 89.424 TB.

Use `POST /v1/recording/storage-calculator` to calculate other scenarios.

## Playback and evidence APIs

- `GET /v1/cameras/:id/recording` — current recording policy and state.
- `PUT /v1/cameras/:id/recording` — configure recording and storage policy.
- `GET /v1/cameras/:id/recordings` — query indexed segments.
- `GET /v1/cameras/:id/playback?from=...&to=...` — ordered timeline,
  coverage percentage, and detected gaps (maximum 31-day query window).
- `GET /v1/cameras/:id/recording/legal-holds` — list evidence holds.
- `POST /v1/cameras/:id/recording/legal-holds` — protect a time range.
- `DELETE /v1/cameras/:id/recording/legal-holds/:holdId` — release a hold.

Recording reads honor `recording:view`, evidence holds honor
`evidence:export`, configuration honors `device:configure`, and camera-specific
deny/approval rules continue to apply.

## Deployment configuration

The control plane needs:

```text
RECORDING_ENGINE_URL=http://recording-engine:8091
RECORDING_ENGINE_SHARED_KEY=<at-least-32-random-characters>
```

The recorder needs:

```text
CONTROL_PLANE_URL=http://api:8080
RECORDING_ENGINE_SHARED_KEY=<same-random-key>
RECORDING_ROOT=/recordings
STORAGE_NODE_EXTERNAL_ID=<stable-node-id>
STORAGE_NODE_NAME=<operator-visible-name>
STORAGE_NODE_TIERS=hot,warm,cold
STREAM_SECRETS_JSON=<secret-reference-to-RTSP-map>
```

Production should replace the environment JSON secret map with a vault-backed
secret provider, mount a dedicated recording array at `RECORDING_ROOT`, keep the
OS on separate storage, and provide a different physical backup destination.
