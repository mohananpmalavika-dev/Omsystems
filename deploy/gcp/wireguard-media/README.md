# GCP-hosted private media link

Use this when an Edge Agent can reach its cameras over an existing branch VPN,
but the GCP server cannot reach that Edge Agent. WireGuard adds a second,
outbound-initiated link from the Edge Agent machine to the GCP VM. The camera
VPN remains unchanged.

```text
Browser -> HTTPS media host on GCP -> WireGuard -> Edge Agent:8090
                                               -> existing camera VPN -> camera
```

The repository does not install WireGuard or distribute its private keys. Those
are operating-system network settings and must be provisioned on both machines.
Never put generated keys, tunnel configuration containing keys, or camera
credentials in Git.

## 1. Connect the two hosts

Reserve a stable external IP for the GCP VM. Install WireGuard on the GCP VM
and Edge Agent machine. Generate a **different key pair on each machine**. Use
a dedicated non-overlapping subnet; `10.203.0.0/30` below is an example only.
If the existing camera VPN or GCP VPC uses that range, choose another.
On the GCP VM, `bootstrap-gcp.sh` generates its key pair under
`/etc/wireguard` without printing the private key or enabling an interface.

GCP `/etc/wireguard/wg0.conf`:

```ini
[Interface]
Address = 10.203.0.1/30
ListenPort = 51820
PrivateKey = <GCP_PRIVATE_KEY>

[Peer]
PublicKey = <EDGE_PUBLIC_KEY>
AllowedIPs = 10.203.0.2/32
```

Edge Agent machine's WireGuard tunnel:

```ini
[Interface]
Address = 10.203.0.2/30
PrivateKey = <EDGE_PRIVATE_KEY>

[Peer]
PublicKey = <GCP_PUBLIC_KEY>
Endpoint = <GCP_STATIC_PUBLIC_IP>:51820
AllowedIPs = 10.203.0.1/32
PersistentKeepalive = 25
```

The Edge Agent initiates the connection; no branch internet port forward is
needed. Allow UDP 51820 to the GCP VM in its GCP VPC firewall and host firewall.
Restrict the source to the branch's public IP if it is stable. On the Edge Agent
machine, allow TCP 8090 only from `10.203.0.1`, not from the public internet.
Do not route `0.0.0.0/0` through this WireGuard link: GCP SSH, dashboard
traffic, and the camera VPN should keep their existing routes.

Verify the tunnel from the GCP VM:

```sh
curl --fail http://10.203.0.2:8090/health
```

Then verify the same URL **inside the Caddy container**; Docker-to-WireGuard
forwarding must work as well:

```sh
docker exec sentinel-gcp-caddy wget -qO- http://10.203.0.2:8090/health
```

## 2. Enable the HTTPS media host

Point a dedicated DNS name such as `media.example.com` to the GCP VM's static
public IP. Set `EDGE_MEDIA_DOMAIN` to that hostname and `EDGE_MEDIA_UPSTREAM`
to `10.203.0.2:8090` in the GCP Compose environment. Copy
`../sites/edge-media.caddy.example` to `../sites/edge-media.caddy`. From
`/opt/sentinel-grid/deploy/gcp`, validate the one-off Caddy container before
recreating the running Caddy container:

```sh
docker compose -f docker-compose.gcp.yml run --rm --no-deps caddy \
  caddy validate --config /etc/caddy/Caddyfile
docker compose -f docker-compose.gcp.yml up -d --no-deps caddy
```

The existing dashboard hostname has
different `/v1/*`, `/hls/*`, and `/health` routes and must not be reused as the
Edge Agent media host.

Verify `https://media.example.com/health` returns
`sentinel-edge-media-gateway` before changing the Edge Agent's advertised URL.

## 3. Switch the installed Edge Agent

In the installed Edge Agent config, set:

```text
LIVE_MEDIA_ENABLED=true
EDGE_LIVE_GATEWAY_HOST=0.0.0.0
EDGE_LIVE_GATEWAY_PORT=8090
EDGE_MEDIA_ENABLE_WEBRTC=false
MEDIA_TUNNEL_MODE=disabled
MEDIA_QUICK_TUNNEL_FALLBACK=false
EDGE_MANAGED_MEDIA_BOOTSTRAP=false
PUBLIC_MEDIA_GATEWAY_URL=https://media.example.com
```

`EDGE_MANAGED_MEDIA_BOOTSTRAP=false` matters: when enabled, a saved managed
Cloudflare bootstrap overrides `MEDIA_TUNNEL_MODE` with `named` at startup.
WebRTC is disabled for this first setup because proxying WHEP signaling alone
does not provide a public ICE/media path. HLS works through the HTTPS proxy;
WebRTC can be enabled later with a TURN or equivalent media relay design.
Restart the Edge Agent after updating its config. Its heartbeat should then
advertise the HTTPS media hostname instead of a temporary `trycloudflare.com`
hostname. Keep the existing camera `edge://` secret reference; selecting the
central `vpn` camera transport would require the GCP media gateway itself to
reach the camera and hold a central stream secret.

Test a new authorized live session after the heartbeat updates. An HLS `500`
after the new route is active means the Edge Agent reached MediaMTX but the
camera stream or muxing still needs diagnosis; changing the tunnel does not
repair that upstream error.

## Direct camera failover when the Edge Agent is offline

The WireGuard link above terminates on the Edge Agent machine and proxies its
port 8090. It cannot deliver video if that machine or its media process is down.
For independent failover, terminate a separate branch-to-GCP VPN on the DVR
(when supported) or on an always-on router. Route the DVR's camera subnet to
the GCP media gateway and allow only the required RTSP ports.

Run migration `20261001_central_stream_secrets.sql` and set a stable
`STREAM_VAULT_KEY` on the GCP control plane before deploying the updated Edge
Agent. Generate it once with `openssl rand -base64 32`; store it in the GCP
secret configuration, never in Git. Changing this key without re-encrypting
existing rows makes the stored streams unreadable. New camera URLs and
DVR/camera logins are written to the encrypted DB vault. The Edge Agent reads
stream URLs from GCP when starting a live connection and fetches host
credentials for discovery and recorder probes. It does not write new camera
passwords to a local vault. Existing local vault files are imported and
removed after the complete import succeeds; a failed import leaves those
legacy files in place for a later retry. New streams require the control
plane to be reachable, so branch playback cannot start during a GCP outage.
If an older Edge Agent configuration has usernames or passwords inside
`RECORDERS_JSON`, remove them from its environment file after confirming that
the corresponding credentials reached the central vault.
The first control-plane startup migrates legacy `camera_credentials.password`
values into encrypted storage. Restrict older database backups that still
contain plaintext values under your retention policy.
The central media gateway already uses the control plane's authenticated
`/v1/secrets/resolve` endpoint. Verify that every required camera reference
has synced before relying on failover; an already-offline agent cannot upload
its local credentials. The GCP media gateway must also reach each camera over
the independent VPN and have the correct main/substream profile.
