# Sentinel Branch Gateway

This is the production branch connector for an unattended, multi-location CCTV estate. It runs on a small managed appliance inside the camera/DVR network; staff laptops and branch computers are not part of the runtime.

## What stays online

- The single `edge-agent` appliance service discovers ONVIF cameras, probes RTSP, verifies DVR/NVR channels and recordings, and sends health telemetry.
- The agent supervises bundled MediaMTX and cloudflared processes. MediaMTX converts only an operator-selected private RTSP feed to browser-compatible HLS, while cloudflared maintains an outbound-only named tunnel.
- No inbound firewall port or public camera address is required. Docker restarts the appliance after a crash or reboot, and its encrypted identity, credentials, outbox, and media state remain in a named volume.

## Factory provisioning

1. In Sentinel Grid, open the branch, choose **Enroll gateway**, and copy the one-time activation code. No branch ID, agent ID, shared API key, or `.env` editing at the branch is required.
2. The control plane automatically creates a remotely managed tunnel and DNS hostname for the branch. It delivers the connector token only to the authenticated gateway; operators never see it and PostgreSQL never stores it.
3. During central appliance preparation, copy `.env.example` to `.env` and insert only the control-plane URL and one-time activation code. There is no branch ID, agent ID, camera password, public hostname, shared API key, or tunnel token to edit. First boot consumes the code, receives its unique identity and managed media bootstrap, and stores both encrypted in the persistent volume.
4. From the repository root, run:

   `docker compose --env-file deploy/branch-gateway/.env -f deploy/branch-gateway/compose.yaml up -d --build`

5. Reboot the appliance once and confirm the single appliance container returns automatically. Sentinel Grid must show independently verified Gateway, Tunnel, Internet, DVR/NVR, Camera, Live View, Recording, Health, and AI-rule stages; a heartbeat alone does not mark the branch operational.

## Analog cameras connected to a DVR/XVR

Connect only the DVR/XVR Ethernet port and the Branch Gateway to the same LAN. Analog cameras remain connected by coax to the recorder; they do not need individual IP addresses. During discovery the gateway identifies the recorder, enumerates its ONVIF media profiles, normalizes Hikvision, Dahua and CP PLUS/OEM channel URIs, and creates one review item per physical channel. The recorder password is entered once through the encrypted credential command and is never copied into the cloud database.

Each approved channel appears in the normal camera wall with an **Analog via DVR · CH n** source label. Live view is proxied on demand from that channel, while recording status, recent-media evidence, disk health and playback verification continue to come from the DVR. An offline or unverified channel is kept in review state instead of being reported as operational.

When a recorder exposes main and sub profiles, the gateway keeps the main profile
assigned to recorder-local recording and selects the substream for remote live
view and analytics. The stream role, resolution, FPS, bitrate, and intended use
remain in the control plane so a main stream is not silently pulled continuously
over the branch WAN.

## Existing site-to-site VPN

The camera network and the control uplink are separate decisions. A gateway can
read cameras and DVRs on its local LAN while sending control traffic, telemetry,
and events through the organization's existing VPN. These approved sources keep
their `edge://` secret route; approval does not rewrite them to an unusable central
VPN route. Register a source as direct VPN only when the datacenter will read its
private address through the routed VPN and its stream secret exists centrally.

## Operating model

Ship the provisioned appliance with only two labelled connections: power/UPS and camera-network Ethernet. Branch staff plug it in; the central team owns tunnel configuration, signed updates, encrypted camera credentials, remote diagnostics, and monitoring. Telemetry is queued in an encrypted local outbox during internet loss and replayed in order after reconnection.

Camera and recorder passwords entered in Sentinel Grid are sealed to the enrolled gateway's public key. The cloud command queue contains ciphertext only; the gateway decrypts it into a separate encrypted local vault and immediately runs rediscovery.

A second appliance can be installed for branch-level high availability where required.

Do not use Cloudflare Quick Tunnels in production. Their hostname changes, and they are not an unattended fleet identity.

## Production checks

- Keep the appliance on a UPS and enable automatic power-on after AC recovery in firmware.
- Reboot it before shipping and confirm `docker compose ps` reports all services healthy.
- Revoke a lost appliance from Sentinel Grid; its unique API credential and branch tunnel are revoked together.
- Use signed releases with a pilot rollout percentage before expanding an update across the fleet.
- Cloudflare carries HTTPS control and on-demand browser media. Cameras and DVRs remain private and are never exposed directly.
