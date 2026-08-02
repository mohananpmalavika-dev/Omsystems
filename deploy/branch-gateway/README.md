# Sentinel Branch Gateway

This is the production branch connector for an unattended, multi-location CCTV estate. It runs on a small managed appliance inside the camera/DVR network; staff laptops and branch computers are not part of the runtime.

## What stays online

- `edge-agent` discovers ONVIF cameras, probes RTSP, verifies DVR/NVR channels and recordings, sends health telemetry, and serves permission-authorized live sessions.
- `mediamtx` converts a selected private RTSP feed to browser-compatible HLS only when an authorized operator opens it.
- `cloudflared` maintains a stable outbound-only named tunnel. No inbound firewall port or public camera address is required.
- Docker restarts every service after a crash or appliance reboot, and gateway state is kept in a named volume.

## Factory provisioning

1. In Sentinel Grid, open the branch, choose **Enroll gateway**, and copy the one-time activation code. No branch ID, agent ID, shared API key, or `.env` editing at the branch is required.
2. In Cloudflare Zero Trust, create a remotely managed tunnel dedicated to that branch. Add a public hostname such as `branch-001.media.example.com` with service `http://edge-agent:8090`.
3. Copy `.env.example` to `.env` and insert the one-time activation code, stable hostname, and tunnel token. Do this during appliance preparation—not at the branch. First boot consumes the code, receives a unique revocable identity, and stores it encrypted in the persistent volume.
4. From the repository root, run:

   `docker compose --env-file deploy/branch-gateway/.env -f deploy/branch-gateway/compose.yaml up -d --build`

5. Reboot the appliance once and confirm all three containers return automatically. Sentinel Grid should show Gateway, Tunnel, Camera, Recording, and Internet readiness for the branch.

## Operating model

Ship the provisioned appliance with only two labelled connections: power/UPS and camera-network Ethernet. Branch staff plug it in; the central team owns tunnel configuration, signed updates, encrypted camera credentials, remote diagnostics, and monitoring. Telemetry is queued in an encrypted local outbox during internet loss and replayed in order after reconnection.

Camera and recorder passwords entered in Sentinel Grid are sealed to the enrolled gateway's public key. The cloud command queue contains ciphertext only; the gateway decrypts it into a separate encrypted local vault and immediately runs rediscovery.

A second appliance can be installed for branch-level high availability where required.

Do not use Cloudflare Quick Tunnels in production. Their hostname changes, and they are not an unattended fleet identity.

## Production checks

- Keep the appliance on a UPS and enable automatic power-on after AC recovery in firmware.
- Reboot it before shipping and confirm `docker compose ps` reports all services healthy.
- Revoke a lost appliance from Sentinel Grid; its unique API credential stops working immediately.
- Use signed releases with a pilot rollout percentage before expanding an update across the fleet.
- Cloudflare carries HTTPS control and on-demand browser media. Cameras and DVRs remain private and are never exposed directly.
