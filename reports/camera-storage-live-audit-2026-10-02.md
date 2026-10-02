# Camera storage repair — 2 October 2026

## Applied and verified

- Audited all 11 registered cameras in the live database.
- Repaired nine missing Local Camera Pilot recorder/channel mappings using matching discovery ID, branch, gateway, IP address, verified stream, and analog channel evidence. All nine now reference `recorder-192.168.29.171` with their observed channel numbers.
- Kept the standalone IP camera independent of recorder storage.
- Deployed the dashboard storage page/API fix. Every matched SD card and recorder disk now exposes model, total/used/free capacity, access/write-verification status, health, and report time.
- Healthy media can be selected even when a failed disk appears first. Read-only, unformatted, missing, and failed-write media are excluded from healthy candidates. Cross-branch disk associations are rejected.
- Placeholder recorder observations no longer appear as physical disk models or zero-byte usage. Missing telemetry shows an explicit diagnostic.
- Three relevant test files passed: 16 tests. Dashboard typecheck and production Docker build passed. Live storage page returned HTTP 200; anonymous storage API returned HTTP 401. The running dashboard contains the new API code.

## Live inventory and unresolved device evidence

| Cameras | Recorder mapping | Disk model/capacity evidence | Access evidence |
| --- | --- | --- | --- |
| Local Camera Pilot: nine CP PLUS DVR channels | Repaired; recorder `192.168.29.171` | Fresh recorder diagnostic succeeded but returned zero disk records. Physical HDD model and capacity remain unavailable. | No verified storage write evidence |
| Local Camera Pilot: standalone `IPC_NT98566_IPG-N4C-WQ2_S38` camera | No recorder mapping needed | No camera memory-card observation received | Unverified |
| Hajipur: CP PLUS DVR channel 4 | Existing mapping retained | No disk observation received | Unverified; diagnostic command remains queued |

Recorder diagnostic commands for `192.168.29.58`, `172.29.55.100`, Hajipur `172.29.91.100`, and NORTH ZONE recorder `538AA564ER92Y00G` remained queued at final verification. A stored `online` flag does not establish that those gateways currently receive commands. The user confirmed gateways are on and credentials are configured; their control connections still require diagnosis.

Existing recorder placeholders for Local Camera Pilot, NORTH ZONE, and PERAVARUNI report unavailable storage telemetry. They do not establish a physical disk count or zero capacity. The recorder model recorded in these placeholders is not a verified HDD model.

## Deployment and recovery

Only the dashboard was rebuilt/recreated. Server source backup: `/tmp/camera-storage-dashboard-backup.Xk4b33UW.tar`. Build log: `/tmp/camera-storage-dashboard-deploy.log`. The two changed dashboard source files remain modified on the server; an updater using `git reset --hard` will replace them unless the repository changes are committed and distributed.

No recording deletion, disk formatting, credential change, or permission expansion was performed. Actual disk capacity and storage access cannot be certified until the device storage API returns hardware evidence and the remaining gateways acknowledge diagnostics.
