# Storage repair — 2 October 2026

## Verified live result

The Local Camera Pilot gateway is running **0.1.43**. Its CP PLUS/Dahua DVR at `192.168.29.171` now publishes physical disk telemetry automatically. A controlled gateway restart confirmed that storage polling resumes from the saved recorder registry, without another discovery scan or a manually seeded disk record.

The recorder reports one physical disk (`/dev/sda`) with **1,971,123,650,560 bytes** total capacity (1.97 TB). After restart, it reported **1,584,142,483,456 bytes** used and **386,981,167,104 bytes** free (387 GB).

## Root causes and fixes

1. The recorder returns `list.info[0].Detail[0..3]` partition records. The edge parser only recognized indexed `Storage`, `Disk`, `HDD` and `Drive` records, so a successful storage API request produced zero disks. The parser now groups partition records by physical disk, sums complete device-reported counters, and preserves error and read-only evidence. It also accepts indexed `StorageDevice`, `DriveInfo` and `Storage.Drive` variants.
2. Discovered recorder connections existed only in the running process. Restarting the gateway lost its storage polling inventory. Recorder connections now persist atomically in an agent/branch-scoped registry, excluding usernames and passwords. Previously installed gateways recover missing recorder connections from their centrally saved camera mappings. Recorder channel zero is retained.
3. Some authenticated requests omitted the agent-version header, allowing live-session calls to replace the recorded version with `unknown`. Gateway requests now carry the current runtime version after the heartbeat.

A separate control-plane normalization correction prevents `state: unknown` placeholders from being classified as detected physical disks. That correction is covered by local tests; the control-plane container was not rebuilt for this follow-up.

## Validation

- **52 tests passed across six files**, including the actual recorder response fixture, probe-to-telemetry normalization, partition failures, registry persistence, credential exclusion, branch isolation, concurrent saves, corrupt-file preservation, camera mapping recovery, gateway request headers and dashboard storage association.
- The final mapping/header follow-up was rerun separately: **8 tests passed**.
- Edge-agent typecheck, root typecheck and test typecheck passed. The packaged **0.1.43 Windows executable** passed runtime/package verification.
- The complete executable was installed with configuration/executable backups. Its installed SHA-256 is `DDA875B08C6C3F1201AA827FA3DFBE887022D1104648F8BCCFC7D343229EC69C`.
- Automatic disk observation before the verification restart: **20:45:34 IST** (`2026-10-02T15:15:34.598Z`).
- Controlled restart began at **20:46:39 IST**; gateway health returned at **20:46:47 IST**.
- Automatic disk observation after restart: **20:46:54 IST** (`2026-10-02T15:16:54.584Z`). The live database also reported agent version `0.1.43` and a fresh heartbeat.
- A later automatic poll at **20:48:36 IST** (`2026-10-02T15:18:36.337Z`) refreshed usage again, confirming recurring storage collection after restart.
- Persistent registry: `C:\Program Files\Sentinel Grid\Edge Agent\data\recorder-registry.json`. It contains the DVR connection and no device credentials.

## Deployment evidence and remaining limits

The first executable replacement encountered a Windows file lock and rolled back successfully. The installer was corrected to stop the scheduled task and wait for the process/file lock before replacement. A signed application-only patch then failed to resolve `onnxruntime-node` under the packaged launcher and was rejected; the final installation uses the complete verified executable. The failed delta was not assigned as a fleet rollout.

The unassigned 0.1.42/0.1.43 diagnostic delta artifacts were moved from the server's public update directory into `edge-agent/release/rejected-storage-updates/`, with copies retained for diagnosis. They are no longer served by the update artifact endpoint.

The reusable full-executable installer is `scripts/install-edge-storage-fix.ps1`. Deployment evidence is in `tmp/storage-install-0.1.43.json` and `tmp/storage-restart-verification.json`. Previous executable/configuration backups remain in the installed gateway directory.

The recorder does not expose a verified physical HDD model, SMART health, or explicit per-disk recording-write verification in this response. Those remain unavailable/unverified; partition `ReadWrite` access is not treated as a proven recording write. No recordings were deleted and no disk was formatted.

Hajipur remains on `0.1.38` with its last control heartbeat at **17:19 IST on 1 October 2026**. Its queued recorder diagnostic has not been acknowledged. That gateway and the other disconnected branches cannot be certified or updated through their current control connection. This repair is live-verified for Local Camera Pilot only.
