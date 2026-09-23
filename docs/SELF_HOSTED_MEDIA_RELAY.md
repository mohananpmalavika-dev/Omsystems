# Self-hosted Edge media relay

The project can carry live HLS from a camera-side Edge Agent to the GCP control plane without Cloudflare or a per-PC WireGuard configuration. The camera still needs to be reachable **from the Edge PC** over its existing LAN/VPN. GCP does not need a route to the camera.

```
Camera -- LAN/VPN --> Edge Agent -- outbound WSS/443 --> GCP control plane
                                                  <-- HTTPS HLS -- Dashboard
```

The control plane provides each enrolled agent with a media URL under `/v1/edge-media/<agent-id>`. The Edge Agent uses its existing encrypted enrollment credential to authenticate the outbound WebSocket connection. The local media gateway binds to loopback. Live-session grants remain single-use, and HLS segments require the normal short-lived media bearer token. No branch inbound firewall rule or separate tunnel install is required.

## Enable on GCP

Set `EDGE_MEDIA_RELAY_ENABLED=true` once in the GCP deployment environment. It defaults to `false` to avoid switching an existing Edge Agent before its updated binary is rolled out. `CONTROL_PLANE_PUBLIC_URL` must be the reachable HTTPS Caddy origin. Deploy the updated control plane and Edge Agent installer together. Existing enrolled Edge Agents need the updated binary; at startup they refresh managed media bootstrap and switch from `quick`/`named` to `relay` automatically. New activation packages also receive relay bootstrap automatically. No individual Edge-PC config edit is part of this mode.

To disable the new mode temporarily, set `EDGE_MEDIA_RELAY_ENABLED=false` on the control plane and redeploy. Cloudflare tunnel behavior remains available when configured.

## Verify

1. On the Edge PC, verify the Agent is enrolled, online, and can reach the camera over the existing VPN.
2. Confirm the Agent log says `Self-hosted media relay is reachable` and its heartbeat advertises `https://<gcp-host>/v1/edge-media/<agent-id>`.
3. Open a new authorized live view. The HLS URL should remain on the GCP host under the same agent path. A `503 edge_media_offline` means no authenticated Edge connector is currently attached; an HLS `500 stream_muxing_failed` means the request reached the Edge Agent, but the camera/MediaMTX stream still needs diagnosis.

This first relay mode carries HLS and talkback HTTP requests, not WebRTC media/ICE. It is process-local on the GCP control plane: run a single control-plane replica for this mode, or add shared connection routing before scaling horizontally. The WebSocket frame limit is 12 MiB and per-agent requests are bounded; recording, bulk evidence export, and high-scale video fan-out need a dedicated streaming architecture.
