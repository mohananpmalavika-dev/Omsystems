# CCTV production acceptance status

This is an engineering acceptance record, not a legal opinion or a hardware certification.

| Workstream | Code state | Production acceptance still required |
| --- | --- | --- |
| Recorder credentials | Resolver injection and tenant-scoped opaque references fail closed | Wire `createProductionRecorderManager(store)` into the deployed recorder command worker and run a vault-backed camera probe. |
| Vendor/firmware matrix | Exact model/firmware records require hashed artifacts plus Ed25519 attestation before `CERTIFIED` | Execute KV-CERT-1.0 on each physical vendor/model/firmware/hardware-revision combination. |
| WebRTC/SRT/multicast | Authenticated WebRTC WHEP proxy; SRT and multicast are explicit edge feature gates | Open and test ICE/TURN and UDP/firewall paths; certify every enabled source protocol. |
| Fisheye | FFmpeg `v360` derived-artifact service; it never overwrites the source | Obtain a per-camera calibration and visually validate all operator views. |
| Firmware | Deployment/rollback now need a verified executor receipt and SHA-256 match | Implement the signed edge/vendor executor; perform a canary upgrade and rollback on each certified model. |
| Two-way audio | Advertised capability no longer counts as hardware validation | Edge probe must capture codec negotiation, speaker/mic loopback, latency/loss and write `verifiedAt`; run on each physical device. |
| Camera-to-evidence E2E | Signed evidence packaging exists | Run physical camera → recorder → playback → export → verification and attach hashed test artifacts to the certification record. |
| Redis/PostgreSQL/media failover | Existing simulated tests cover fencing, route handoff and custody sequence/hash continuity | Run an isolated staging chaos drill with real Redis, PostgreSQL replication and at least two media nodes. Save measured RTO/RPO and failed-stream count. |
| Tenant/branch isolation | Media route renew/release/capabilities and edge HLS/WHEP now re-authorize ownership/token/camera scope | Run the full endpoint test matrix against a production-like auth + PostgreSQL + Redis deployment; include a cross-tenant and cross-branch denial for every endpoint. |
| Electronic-record certificate | Signed BSA Section 63 workflow binds record, device particulars, production method, hashes and named custodian attestation | Have legal counsel approve the organisation's jurisdiction profile, custodian authority, template wording and court filing process. |

## Required evidence per physical acceptance run

1. Device identity, exact firmware, hardware revision and serial number.
2. Start/end timestamp, bench/network topology and operator identity.
3. Raw protocol logs, media hashes, screenshots/recordings where applicable.
4. Signed artifact manifest and verifier result.
5. Explicit `PASS`, `FAIL`, `SKIP`, or `NOT_TESTED`; never infer `PASS` from vendor advertisement.

## Deployment blocks

Do not enable a device feature in a banking/NBFC production policy until its exact matrix row is `CERTIFIED` or an approved compensating control is recorded. `TEST_REQUIRED`, `UNVERIFIED`, and advertised-only capabilities are not production approval states.
