# Phase 1 — Continuous Recording Acceptance Gate

> Status: **not yet accepted**. Do not describe recording as production-grade
> until every required scenario below has passed with retained evidence from
> real cameras.

This gate proves the first recording capability only: continuous, independent
recording from representative camera sources. Live View must remain closed for
the baseline run; opening a dashboard stream is not evidence that the recorder
works.

## Test bench

Use one stable recorder node with a dedicated, monitored recording volume and
NTP enabled on the recorder, cameras, DVR/NVR, and control plane. Register
these six source profiles as separate cameras/jobs where possible:

| ID | Source | Codec/profile | Required evidence |
| --- | --- | --- | --- |
| HIK-H264-MAIN | Hikvision IP camera | H.264 main stream | indexed/playable segments |
| HIK-H265-SUB | Hikvision IP camera | H.265 substream | indexed/playable segments |
| CPP-H264-MAIN | CP Plus IP camera | H.264 main stream | indexed/playable segments |
| CPP-H265-SUB | CP Plus IP camera | H.265 substream | indexed/playable segments |
| DVR-MAIN | DVR/NVR channel | main stream | indexed/playable segments |
| DVR-SUB | DVR/NVR channel | substream | indexed/playable segments |

Record the device model, firmware, ONVIF/RTSP URL profile, configured
bitrate/frame rate, recorder build/image digest, and clock offset before
starting. Camera credentials must be stored through the approved secret
mechanism, never in the runbook or test evidence.

## Pre-flight

1. Deploy the control plane, recording engine, PostgreSQL, and a dedicated
   recording volume. Confirm the engine reports its storage node as healthy.
2. Configure each test camera for `continuous`, `enabled: true`, 60-second
   segments, and the approved 180-day retention policy.
3. Verify that `GET /v1/cameras/:id/recording` reports `recording` without
   creating a live session.
4. Capture a baseline `GET /v1/cameras/:id/playback` response for every
   source and retain the recorder/control-plane logs with timestamps.

## Seven-day baseline

Run every source continuously for **168 hours**. Do not use a video wall or
dashboard as the source of truth. Every 24 hours, collect:

- recording job status and unacknowledged recording health events;
- storage used/free space and write throughput;
- segment count, index latency, checksum failures, and failed-index sidecars;
- a sample from the first, middle, and latest segment decoded with `ffprobe`;
- a playback timeline query covering the preceding 24 hours.

Pass only when all six sources have 168 hours of expected coverage with no
unexplained playback gap greater than the configured tolerance. Planned
fault-injection gaps must be explicitly labelled and excluded from the
uninterrupted baseline window.

## Fault-injection matrix

Run each scenario against at least one Hikvision camera, one CP Plus camera,
and the DVR/NVR channel. Restart or restore the exact source used after each
scenario and retain a before/after playback timeline.

| Scenario | Injected action | Required pass condition | Evidence |
| --- | --- | --- | --- |
| Camera reboot | Reboot source camera/DVR channel | worker retries, recording resumes automatically | `recording_stopped` then `recording_started`, measured timeline gap |
| Recorder restart | Restart recording-engine process/container | persisted jobs restore and resume automatically | engine logs, job status, first new indexed segment |
| Invalid credentials | Replace only the test secret with an invalid password | visible critical fault; no crash/restart storm | `stream_secret_unavailable` or FFmpeg failure health event |
| Network loss | Block RTSP traffic for a measured interval | visible fault/gap; no false segment coverage | start/end timestamps and playback gap equal measured outage ± segment tolerance |
| Network restore | Restore RTSP traffic | recorder recovers automatically | recovery health event and decoded post-restore segment |
| Disk full | Use a disposable constrained volume or quota | fault is visible; recorder stays alive; no unsafe deletion | storage 95% critical event, process health, no policy-violating deletion |
| Index callback loss | Temporarily block recorder → control-plane traffic | segment is retained and later indexed | `.index.json` retry evidence and one final indexed segment |
| Retention policy | Use an isolated short-retention test policy | only eligible, unheld segments are deleted | deletion audit, legal-hold preservation proof |

Never simulate a disk-full test on the production recorder or a volume that
contains evidence.

## Segment and timeline verification

For every source and fault test:

1. Verify every completed segment is present in `recording_segments` and has a
   unique path, size, start/end time, storage node, and `ready` status.
2. Decode a representative segment from each hour with `ffprobe`; reject any
   segment with decode errors or missing video stream.
3. Query playback for the same interval and compare its gaps with injected
   outages. There must be no hidden or unexplained gaps.
4. Compare segment times to the camera overlay/NTP reference. Record the
   maximum observed error; acceptance target is **≤ 2 seconds** after allowing
   for segment boundary timing.
5. Verify a retention candidate is not deleted when covered by an active legal
   hold, and is deleted only after its policy eligibility and hold release.

## Required evidence package

Create one immutable evidence folder per test run containing:

- source inventory and configuration export (redacted);
- start/end UTC times and operator initials;
- image digests/configuration versions for all services;
- health-event export, engine logs, and storage metrics;
- playback timeline JSON before/after every injected failure;
- `ffprobe` output for every selected segment;
- segment-index export and checksum verification results;
- retention and legal-hold test results;
- a signed final result table below.

| Requirement | Result | Evidence reference | Approved by/date |
| --- | --- | --- | --- |
| Seven uninterrupted days per source | Pending |  |  |
| Recovery after camera reboot | Pending |  |  |
| Recovery after recorder restart | Pending |  |  |
| Invalid-credential fault | Pending |  |  |
| Measured network gap/recovery | Pending |  |  |
| Segment indexing/decoding/playback | Pending |  |  |
| Timestamp accuracy | Pending |  |  |
| Disk-full resilience | Pending |  |  |
| Retention and legal-hold behaviour | Pending |  |  |

## Exit decision

The Phase 1 owner, security operations lead, and platform owner must all sign
the evidence package. Any failed, skipped, or inconclusive row keeps the
status at **not accepted**. Only after this gate passes may the team begin
production-readiness work for recording; advanced modes, video-wall operations,
AI analytics, and evidence exports do not substitute for it.
