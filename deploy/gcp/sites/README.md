# Optional Edge Agent media site

`edge-media.caddy.example` is inactive. To enable it, copy it to
`edge-media.caddy` and set these Compose environment values:

```text
EDGE_MEDIA_DOMAIN=media.example.com
EDGE_MEDIA_UPSTREAM=10.203.0.2:8090
```

The upstream must be the Edge Agent's WireGuard address. Caddy preserves the
request path, authorization header, and HLS query tokens. Only the Edge Agent's
live, talk, HLS, and health routes are exposed; the MediaMTX API and
the Edge Agent's internal authentication endpoint are not proxied.

See [WireGuard media setup](../wireguard-media/README.md) before enabling this
site. Do not commit WireGuard keys or an active site containing private host
details unless they are intended to be public.
