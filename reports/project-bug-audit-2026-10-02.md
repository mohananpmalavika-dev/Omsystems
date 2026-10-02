# Project bug audit — 2 October 2026

This audit combines repository-wide TypeScript/test checks with focused source review. It is not a guarantee that every bug has been found. Production services, real cameras, storage servers and external OCR services were not exercised.

## Fix status — 2 October 2026

Live-view WebRTC follow-up: fixed SDP content parsing and DELETE forwarding in the managed edge relay. The player now allows 25 seconds for on-demand WHEP startup (previously 4 seconds, shorter than the gateway's 15-second source timeout), allows up to 5 seconds for ICE gathering, and handles streamless tracks. Chromium/player and relay regression tests: **10 passed**; earlier edge gateway/relay checks: **18 passed**. These are local fixes; production connectivity and NAT/TURN availability still require branch-specific verification and deployment.

All 13 concrete defects below have been fixed in the working tree. Finding 14, the onboarding lifetime policy mismatch, remains unchanged.

| Findings | Implemented fix |
| --- | --- |
| 1–2 | Gateway consumes the original token once and signs a separate 30-second edge grant. Edge verifies its signature, expiry and replay status. Startup/audio fail when delivery is unavailable. |
| 3 | Multi-profile camera viewers receive separate main/sub MediaMTX paths. |
| 4 | Camera startup reserves the talk lease before asynchronous lookup and releases it on failure. |
| 5 | Exports validate coverage, trim the concatenated timeline by decoding/re-encoding, measure output duration with ffprobe, and never fall back to an untrimmed export. |
| 6 | Only ENOENT initializes an empty retry queue; corrupt/unreadable files fail without overwrite. |
| 7 | Recording uses deterministic numbered staging paths, serializes completion handling, drains final stdout before shutdown, and finalizes remaining actual partial files. |
| 8–9 | FFmpeg startup rejects spawn failures safely; shutdown checks process exit, escalates to SIGKILL, and awaits closed stdio. Failed workers are removed. |
| 10 | OCR preserves one-channel input, handles RGB/RGBA and validates image shape. |
| 11 | Memory/disk snapshots expire after 30 seconds; disk responses use file modification time and stale frames are withheld. |
| 12 | Development-header authentication enforces the same forced-password-change restriction. |
| 13 | Discovery normalizes HEVC/AVC/JPEG aliases before persistence and response. |

Validation after fixes:

- **65 tests passed across 10 files**, including real gateway-to-edge audio delivery, grant forgery/replay rejection, startup races, shutdown completion, export failures, OCR and snapshot freshness.
- **All configured type checks passed**; recording type checking was repeated after its final edits.
- **Media gateway and edge-agent TypeScript builds passed**.
- **Real FFmpeg export passed**: a 10–20 second request across two 15-second segments produced exactly 10 seconds, with red footage followed by blue footage at the expected boundary. Bundled LGPL Windows FFmpeg uses OpenH264; other platforms default to x264. `RECORDING_EXPORT_VIDEO_ENCODER` can override the encoder.
- `git diff --check` passed.

Gateway and edge changes must be deployed together for signed talk handoff, with matching `EDGE_BRIDGE_SHARED_KEY` configuration. Hardware/camera validation and production deployment have not been performed. The full-suite failures recorded below are the pre-fix baseline; the full suite was not rerun.

## High priority

1. **Talkback reuses a consumed single-use token.** `media-gateway/src/app.ts:302` consumes the grant, then forwards that same token to the edge at line 343. `edge-agent/src/streaming/edge-live-gateway.ts:358` consumes it again; `src/database/camera-repository.ts:812` explicitly requires `consumed_at IS NULL`. The second consume therefore fails. The gateway nevertheless creates a session when the edge returns an error. Fix by assigning consumption to one service or issuing a separate authenticated edge grant. Confirmed by tracing the production call path, not a deployed end-to-end test.

2. **Audio silently succeeds without a delivery destination.** `media-gateway/src/app.ts:423–447` forwards only when edge credentials exist, but otherwise counts the bytes and returns 202. No alternative camera delivery occurs. Local injection reproduced 201 on session creation and 202 on audio despite no edge URL. Reject unavailable talkback at startup and reject audio when delivery is impossible.

3. **Main/sub viewers overwrite each other's source.** `media-gateway/src/app.ts:218` derives a path solely from camera ID. `media-gateway/src/media-router.ts:35` patches an existing path with the next source. Starting main and then sub for one camera changes the source for existing viewers, contrary to their profile grants. Reproduction recorded both distinct source URIs under `camera-cam1`. Include the granted stream profile in the path.

4. **Single-talker exclusivity has a race.** `media-gateway/src/app.ts:311` checks the camera lease, then awaits secret/edge resolution before installing it at line 381. Two concurrent requests can both pass the check. Local injection returned `[201, 201]` for the same camera. Reserve the lease before asynchronous operations or serialize startup per camera, with rollback on failure.

5. **Multi-segment evidence exports ignore time boundaries.** `recording-engine/src/evidence/range-exporter.ts:83–112` concatenates whole segments. `concatSegments()` supplies neither seek offset nor duration, although the result reports the requested duration. For two 15-second segments and a request from second 10 to second 20, the export contains 30 seconds while claiming 10. A failed single-segment trim also falls through to untrimmed concatenation. Trim the combined timeline and report actual output duration. Confirmed source-level defect; FFmpeg execution unavailable locally.

6. **Corrupt/unreadable retry queues silently discard jobs.** `recording-engine/src/failover/durable-retry-queue.ts:48–63` treats every read/parse failure as a missing file and clears entries. A subsequent write overwrites the previous queue, losing retries for recording segments. A malformed queue reproduced a successful empty depth result. Only ENOENT should initialize an empty queue; other failures must preserve the file and surface an error.

7. **Recording shutdown can finalize a nonexistent staging path.** `recording-engine/src/engine/recording-session.ts:129–143` creates metadata for a UUID partial path, while FFmpeg writes a timestamp path. The metadata is corrected only on `segment_completed` at line 183. `stop()` finalizes `currentActiveSegment`, so the segment opened after the last completion points at a UUID file that was never written. The final segment may also complete during `ingest.stop()`, whose async event handler is not awaited; it can race with shutdown finalization. Track FFmpeg's actual active file and await serialized completion/finalization during shutdown.

8. **Missing FFmpeg emits an unhandled error.** `recording-engine/src/ingest/ffmpeg-ingest.ts:79` emits the special EventEmitter `error` event on spawn failure. `RecordingSession` subscribes to activity/completion/exit but installs no error listener. With FFmpeg absent from PATH, ENOENT can terminate the process instead of recording a health failure and retrying. Handle the error and make startup fail predictably. FFmpeg is absent on this audit host; the process was not deliberately crashed.

## Medium priority

9. **Force-kill timeout checks signal delivery rather than process exit.** `recording-engine/src/ingest/ffmpeg-ingest.ts:103–105` checks `!proc.killed` before SIGKILL. Node sets `killed` when SIGTERM is successfully sent, even if the child remains alive. A child ignoring SIGTERM survives the timeout while stop resolves, and restart may run another writer. Track exit state or check `exitCode`/`signalCode`, then await actual exit.

10. **OCR corrupts grayscale inputs.** `analytics-engine/src/vehicle/anpr/paddle-ocr-adapter.ts:60–65` always reads RGB values while advancing by `image.channels`. One-channel input reads adjacent pixels as different channels and reads beyond the array at the end. A one-pixel white grayscale input `[255]` reproduced output `[0]`. Preserve grayscale pixels directly and validate supported channel counts.

11. **Disk snapshot cache presents stale footage as current.** `dashboard/app/api/media/snapshot-relay/route.ts:89–100` returns any disk file without an age check and sets `X-Frame-Updated` to request time. When the camera/upstream is unavailable, old footage appears newly updated on every request. Memory cache entries likewise have no expiry. Read persisted capture time or file modification time, enforce freshness, and expose stale state.

## Evidence and limits

## Additional isolated test findings

12. **Password-change restriction is bypassed by development-header authentication.** `src/middleware/auth.middleware.ts:141` sets the user and returns before calling the password-change restriction used later in bearer authentication. A user with `mustChangePassword: true` can access `/protected` using the development identity path. `test/auth-production-boundaries.test.ts:66` reproduced 200 instead of 403 both in the full suite and in isolation. Scope: development mode and routes opting into optional authentication, rather than all production bearer requests. Apply the restriction consistently after identity resolution.

13. **Discovered camera profiles retain noncanonical codec names.** `test/camera-codec-normalization.test.ts:39` reproduced a successful 202 response containing `codec: "hevc"` instead of `"H265"`. The application has normalization logic, but the discovery path does not consistently apply it to these profiles. Consumers relying on the declared canonical codec set can misclassify HEVC cameras. Normalize profile codecs before persistence and response.

14. **Onboarding access lifetime conflicts with its regression test (policy confirmation required).** `test/bootstrap-onboarding-production.test.ts:46` expects at most 3,600 seconds; isolated execution returned 2,592,000 seconds (30 days). This is a reproducible contract mismatch, but the test alone does not establish which lifetime the product intends. Confirm the session policy before treating it as a production security defect.

The isolated rerun finished with **23 passed and 3 failed** across these three test files. Details: `tmp/audit-targeted.log`.

## Validation results

- `npm.cmd run typecheck:all`: **passed**, including root application, tests, and workspaces exposing typecheck scripts.
- Full Vitest: **3,479 tests**, **2,936 passed**, **461 failed**, **82 pending/skipped**. There were 98 failed test files; Vitest's nested-suite count reports 375 failed suites. These counts are test outcomes, not distinct application bugs. Failures include unavailable PostgreSQL, missing Jest/testing-library dependencies, stale expectations, and behavioral failures.
- Complete per-file failure details: `reports/project-test-failures-2026-10-02.jsonl`.
- Follow-up candidates from the full suite include forced-password-change restrictions (development-header path returns before enforcement), onboarding session lifetime, camera codec normalization, analytics bundles, retention, and tenant-isolation expectations. These need individual triage before being counted as confirmed production bugs.

- Reproduction: `node node_modules/tsx/dist/cli.mjs tmp/audit-repro.ts`.
- Reproduced: empty corrupt queue, shared main/sub path, concurrent talkback acceptance, successful audio without a destination, and grayscale corruption.
- Broad type-check output: `tmp/audit-typecheck.log`.
- Full Vitest output: `tmp/audit-tests.log`; structured results, when finished: `tmp/audit-tests.json`.
- Root build/type checks do not alone cover every directory. Root-cause analysis and AI engine are outside the root workspace list; UI/browser and hardware-dependent behavior require additional validation.
