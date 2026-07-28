# Phase 2 Dashboard and Video Wall

## Delivered

- `/v1/cameras` returns up to 500 authorized cameras with branch names in one
  browser request. The control room no longer loads cameras branch by branch.
- The Operations workspace includes a virtualized 400-branch mosaic with
  status, region and search filters. Only visible rows are mounted.
- Branch and component drill-down routes cover cameras, recording/retention,
  storage, network, UPS and edge agents.
- `/v1/operations/events` provides an authenticated, tenant-isolated SSE stream.
  Dashboards resync on events and retain a 30-second polling fallback.
- The control room uses the enhanced 1/4/9/16/25/36/49/64/81/100/121/144-slot
  grid. `/v1/video-wall/layouts` persists per-user layouts and rechecks access
  to every assigned camera before saving.
- Dense walls default to substream-labelled layouts, mount only visible tiles,
  and cap browser live sessions at 16. Scrolling out of view releases the local
  player/session reference so its decoder is removed.

## Honest media boundary

The current camera secret contract resolves one RTSP source URI. The UI records
main/substream intent, but selecting a distinct CP PLUS substream requires the
pilot adapter to store a separate secret reference for each verified profile.
Phase 2 therefore does not claim that every device is already delivering a true
low-resolution substream.

## Verification and field acceptance

`npm run ci:phase2` verifies all builds, the Phase 1 gate, bulk camera access,
400-branch metadata projection, filtering, tenant-isolated event fan-out and
live authorization.

The contractual performance exit still requires deployed measurements: metadata
dashboard p95 below two seconds, branch detail p95 below three seconds, and an
eight-hour soak for every supported video-wall profile. Browser CPU, memory,
decoder count, WAN usage and media-gateway capacity must be captured from real
pilot streams rather than inferred from unit tests.
