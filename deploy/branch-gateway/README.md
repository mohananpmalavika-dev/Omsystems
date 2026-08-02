# Sentinel Branch Gateway

This is the production branch connector for an unattended, multi-location CCTV estate. It runs on a small managed appliance inside the camera/DVR network; staff laptops and branch computers are not part of the runtime.

## What stays online

- `edge-agent` discovers ONVIF cameras, probes RTSP, verifies DVR/NVR channels and recordings, sends health telemetry, and serves permission-authorized live sessions.
- `mediamtx` converts a selected private RTSP feed to browser-compatible HLS only when an authorized operator opens it.
- `cloudflared` maintains a stable outbound-only named tunnel. No inbound firewall port or public camera address is required.
- Docker restarts every service after a crash or appliance reboot, and gateway state is kept in a named volume.

## Factory provisioning

1. In Sentinel Grid, create or select the branch and enroll one Branch Gateway.
2. In Cloudflare Zero Trust, create a remotely managed tunnel dedicated to that branch. Add a public hostname such as `branch-001.media.example.com` with service `http://edge-agent:8090`.
3. Copy `.env.example` to `.env` and insert the branch IDs, enrollment secret, stable hostname, and tunnel token. Do this during appliance preparation—not at the branch.
4. From the repository root, run:

   `docker compose --env-file deploy/branch-gateway/.env -f deploy/branch-gateway/compose.yaml up -d --build`

5. Reboot the appliance once and confirm all three containers return automatically. Sentinel Grid should show Gateway, Tunnel, Camera, Recording, and Internet readiness for the branch.

## Operating model

Ship the provisioned appliance to the branch with only two labelled connections: power/UPS and camera-network Ethernet. Branch staff plug it in; the central team owns tunnel configuration, upgrades, credentials, and monitoring. A second appliance can be installed for branch-level high availability where required.

Do not use Cloudflare Quick Tunnels in production. Their hostname changes, and they are not an unattended fleet identity.

