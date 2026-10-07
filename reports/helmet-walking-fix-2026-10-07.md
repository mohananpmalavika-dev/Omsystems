# Walking-person helmet fix candidate

This candidate is implemented locally. It has not been deployed to the server
or installed on the Local Camera Pilot gateway. Production remains on the
previous helmet release; this report is not evidence of a new CH9 alert.

## Changes

- Helmet detector 1.3.2 replaces the learned-head path's 35% frame-height
  rejection with a minimum 72 source-pixel person height. Person confidence
  remains at least 0.80, and a localized head still needs at least 20x20 actual
  source pixels, spatial association and agreement on both full-head crops.
- When full-frame localization misses a distant person's head, the verifier
  searches a native-pixel upper-body region and maps detections back to the
  original frame. It rejects heads clipped by the search window, caches the
  region per person/frame, and does not retry contrary complete-head evidence.
- Gateway 0.1.49 supports server-requested capture dimensions, retains/selects
  supported recorder main streams for HD helmet capture, and sends 720p frames
  as JPEG at quality 95 with 4:4:4 sampling. Local inference receives original
  RGB. The server validates JPEG dimensions and decodes RGB before inference.
- Cloud upload and local face inference have separate backpressure. An initial
  failed upload retries after two seconds instead of pausing for sixty seconds;
  repeated failures back off to at most thirty seconds. Only the latest frame
  is sampled; no stale-frame delivery queue is added.
- The control plane stores dimensions/encoding with cached frames. Analytics
  request size is increased to 5MiB to accept full-detail payloads.
- The analytics Docker build provisions and checksum-verifies both the head
  localizer and head-evidence model, preserving the correction on fresh builds.

## Scope and configuration

HD capture is opt-in through control-plane `HELMET_HD_CAPTURE_CAMERAS`.
The default is empty, so publishing source alone does not change other cameras
to 720p. An allowed camera also needs an enabled `helmet-worn` rule.

For an initial CH9 pilot, set:

```dotenv
HELMET_HD_CAPTURE_CAMERAS=e66e3498-1c13-4f59-91d7-5a3386d269d2
```

The GCP compose file forwards this variable. A comma-separated list supports
additional cameras; `*` enables HD capture for all cameras with an enabled
helmet rule. Start with CH9 and check gateway CPU, frame freshness and walking
alerts before expanding. Cameras outside the allowlist retain 640x360 capture.
This setting is separate from `HELMET_HEAD_EVIDENCE_CAMERAS=*`, which already
enables the existing head-evidence model globally.

## Validation

155 tests passed across the detector, false-alarm, capture, recorder-source,
model manager, specialty inference, control-plane transport and analytics
adapter suites. Tests include a distant-person fixture, native crop mapping,
insufficient source pixels, negative head evidence, camera isolation, independent
local/cloud processing, HD JPEG dimensions, malformed JPEG rejection and
payloads larger than the old default request limit. The camera-scope test
explicitly retains 640x360 for another helmet camera outside the pilot allowlist.
The analytics adapter suite used an empty model directory to isolate transport
behavior after model-loading runs exceeded their time limits.

Isolated real-frame replay retained one CH4 and two CH8 alert frames, with zero
alerts on 19 known negative images. A JPEG transport replay retained two CH4
and two CH8 alert frames, also with zero alerts on the same 19 negatives.
The score differences show that JPEG does affect classifier output; these
samples do not establish an outdoor-camera sensitivity guarantee.
Both replays submitted zero production events. The two model assets passed
their manifest SHA-256 checks.

## Release status and remaining work

The v0.1.49 delta bundle is built at
`edge-agent/release/updates/0.1.49/edge-agent.bundle`, with a checksum manifest
beside it. It is not yet signed as an OTA release or published. The Windows
executable also built and passed its package checks, but the signed release
workflow stopped at certificate trust validation: this PC does not trust the
existing OmSystems certificate `492444B636DC7C2F1FC7FE6E30F80DE06EE6282F`.
No Windows certificate trust was changed. The candidate executable was saved
under `tmp/helmet-walking-release-backup-20261007/` and the pre-build executable
and manifest were restored.

The restored local executable already differs from the old manifest checksum
(actual `e64885ed6d7c117bb485e9c1a334ba1d83c8d65dbf036559e536013370866dce`,
manifest `8df457a1f0b2482c7b89313e92a6e47f6f90df40f2bcb8c68faa8ca8a8661ccc`).
The installer source is now v0.1.49. Do not publish this incomplete native
release; rebuild/sign the installer and generate its matching manifest on a
release runner that trusts the existing signing certificate.

Deployment must update analytics and control plane before enabling HD capture
or updating the pilot gateway. A new CH9 walking pass must then verify fresh
720p frames, correct source channel, actual wearer detection and a naturally
generated production alert. The current CH9 captures do not contain an
equivalent complete wearer frame for that validation. Very small, blurred or
clipped heads still abstain; increasing the displayed player size cannot
recover source detail.

Evidence: `reports/helmet-head-evidence-raw-replay-2026-10-07.json`,
`reports/helmet-walking-jpeg-replay-2026-10-07.json`, and
`reports/local-pilot-channel9-helmet-check-2026-10-07.md`.
