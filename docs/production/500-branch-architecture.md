# Sentinel Grid: 500+ branch production architecture

## The operating requirement

Sentinel Grid is a central security operations platform for more than 500 branches. A user can see only the organization scope granted to them: the whole company, a zone, a region, an area, a branch, a camera group, or an individual camera. Branch staff are not expected to install, configure, or keep software running.

The platform must support:

- permission-authorized live viewing from any operator location;
- DVR/NVR recording continuity, disk health, channel status, retention, and gap checks;
- recording search and playback where the recorder integration supports it;
- selected real-time analytics and centrally searchable analytics events;
- automatic camera and recorder discovery;
- central alerts for gateway, internet, camera, recorder, storage, and power failures;
- unattended recovery after power, network, process, and appliance restarts.

## Non-negotiable network fact

Cloudflare cannot initiate a connection to a camera or DVR on a private branch LAN by itself. `cloudflared` must run on an always-on device inside that LAN. "No dependency on a laptop or branch computer" is achieved with a centrally managed, fanless Branch Gateway appliance (or a supported router/container host), not by removing the connector.

The appliance is treated like CCTV infrastructure: it is UPS-powered, remotely managed, locked down, and shipped preconfigured. A branch employee only connects power and camera-network Ethernet.

## Production topology

```text
Authorized operator
        |
        v
Sentinel Grid dashboard ---- Control plane ---- PostgreSQL
        |                         |  |
        |                         |  +---- analytics engine
        |                         +------- optional cloud event archive
        |
        +---- short-lived, camera-bound HLS session
                         |
                    Cloudflare edge
                         |
                outbound named tunnel
                         |
           Sentinel Branch Gateway appliance
             |          |            |
          cameras     DVR/NVR      WAN/UPS probes
```

Each branch has its own stable named tunnel and public media hostname. Quick Tunnels are prohibited in production because their hostname is temporary and they are not a durable fleet identity.

## Live video model

The browser never receives camera credentials or a private RTSP address.

1. The user requests a live session from Sentinel Grid.
2. The control plane checks the user's hierarchical and camera-specific grants.
3. The control plane issues a short-lived, one-time token for that camera.
4. The dashboard sends the token to that camera's Branch Gateway hostname.
5. The gateway consumes the token, resolves the RTSP secret locally, and starts an on-demand MediaMTX path.
6. The browser receives a short-lived HLS bearer token bound to that media path.
7. The gateway stops the camera source when no authorized session remains.

This avoids continuously uploading all camera streams. Uploading every camera 24/7 would create large branch bandwidth and cloud egress costs and would make branch internet outages more damaging. Live streams are pulled only when viewed; health telemetry stays continuous and lightweight.

## Recording model

The DVR/NVR remains the primary continuous recorder at each branch. The gateway continually verifies:

- recorder reachability and uptime;
- per-channel recording state;
- HDD/array health and write evidence;
- oldest continuous and newest playable footage;
- recording gaps and policy retention;
- camera-to-recorder channel mappings.

Cloud storage is intended for evidence, event clips, and an optional policy-controlled secondary archive. A small Render disk is not a valid primary archive for hundreds or thousands of continuous camera feeds. A production secondary archive should use object storage with lifecycle policies and capacity planning.

Recorder playback requires a vendor-supported archive search/playback adapter. Health verification is not the same as playback. A branch is marked "recording verified" only from direct archive/channel evidence, never merely because a job was configured.

## Analytics model

Use two modes based on cost and latency:

- Branch analytics: run selected models on a suitably sized gateway for high-volume or low-latency rules. Only detections, snapshots, and event clips leave the branch by default.
- Cloud analytics: open a controlled stream for selected cameras/rules and process it in the always-on analytics service.

The CPU-only starter analytics service is useful for normalized observations and light workloads. It is not capacity proof for all cameras. GPU workers, model artifacts, concurrency limits, and staged load tests are required before enabling full-estate inference.

## Permission enforcement

Organization hierarchy:

`Company -> Head Office -> Zone -> Region -> Area -> Branch -> Camera Group -> Camera`

Permissions are checked by the control plane for live view, recording view, analytics, evidence export, device configuration, and user management. The fleet views are also permission scoped; a regional operator must not learn the status or name of an inaccessible branch.

Do not depend on hidden menu items for security. Every API and session issuance path must enforce the same server-side scope.

## Availability model

Cloud services run on paid, non-sleeping instances. The database uses a paid plan with backups and storage autoscaling. Branch services use Docker restart policies and persistent gateway state. A production rollout should add:

- two control-plane/dashboard instances behind the platform load balancer;
- database point-in-time recovery and tested restores;
- a second Branch Gateway for high-risk branches;
- dual WAN and UPS telemetry where available;
- Cloudflare tunnel alerts and token-rotation procedures;
- centralized logs, metrics, error tracking, and alert delivery;
- canary gateway upgrades followed by region-by-region rollout;
- an external uptime monitor that tests dashboard, control plane, media gateway, and a synthetic branch.

"24/7" is an availability objective, not a promise that any single device can never fail. The system must detect failures quickly, recover automatically where possible, and show operators exactly what is unavailable.

## Branch rollout procedure

1. Build the organization hierarchy and branch records.
2. Assign user roles and scope grants before camera access is enabled.
3. Enroll one Branch Gateway from **Administration -> Branch onboarding**.
4. Create one remotely managed Cloudflare Tunnel and stable hostname for the branch.
5. Prepare the appliance from `deploy/branch-gateway`, insert the one-time activation code and branch tunnel token, and run the reboot test. First boot creates a unique device identity and encrypted local state automatically.
6. Ship the labelled appliance to the branch for plug-in only installation.
7. Confirm the fleet page shows Gateway online, Tunnel ready, and Internet online.
8. Run ONVIF/DVR discovery. Review duplicates and devices requiring credentials.
9. Approve verified devices; map recorder channels explicitly.
10. Validate live video, recorder search/playback support, recording continuity, retention, and alert delivery.
11. Keep the branch in pilot status until it passes a 72-hour soak test.

Roll out in waves: lab, 5 branches, 25 branches, one region, then the wider estate. Capacity certification must use measured camera counts, simultaneous viewers, analytics streams, alert volume, database load, and tunnel recovery—not only UI tests.

## Repository implementation

- `deploy/branch-gateway/compose.yaml`: unattended edge agent, MediaMTX, and cloudflared services.

## Implemented fleet-safety controls

- One-time branch activation; every gateway receives a unique, revocable API credential. The legacy global bridge key is disabled in production.
- Camera credentials use RSA-OAEP/AES-GCM envelope encryption. Only the intended gateway can decrypt them, and its local credential vault is AES-256-GCM encrypted.
- Heartbeats, camera health, recorder/HDD/archive evidence, and command acknowledgements use an encrypted durable outbox during internet loss.
- Remote commands are audited, delivered from a PostgreSQL `FOR UPDATE SKIP LOCKED` queue, idempotently acknowledged, and recovered if a worker crashes mid-command.
- OTA manifests are Ed25519-signed, rollout-scoped, downloaded over HTTPS, checksum-verified, and staged for the appliance supervisor.
- Recorder verification checks recent media, per-channel status, retention continuity/gaps, storage health, and actual playback of the newest available clip.
- Alert snapshots and clips can be mirrored to S3-compatible storage with server-side encryption, optional object lock, and post-upload size/SHA-256 verification.
- Redis holds expiring gateway presence shared by horizontally scaled API instances; PostgreSQL remains the durable source of truth.
- `/metrics` exports Prometheus telemetry; the Kubernetes production manifests include Prometheus/Grafana and horizontal control-plane scaling.

PostgreSQL is the durable job/command queue for the current 500-branch target. RabbitMQ or Kafka is not a prerequisite at this scale; introduce one only when measured event throughput or independent consumer fan-out exceeds the database queue's tested capacity.
- `render.yaml`: paid always-on cloud services, private engine wiring, shared secrets, persistent event storage, and paid PostgreSQL.
- `/operations/edge-agents`: permission-scoped Branch Gateway Fleet readiness.
- `/admin/branch-onboarding`: centralized branch gateway and camera onboarding.
