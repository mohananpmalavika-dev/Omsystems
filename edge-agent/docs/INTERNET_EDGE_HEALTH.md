# Internet and Edge Health Evidence

The edge agent reports host CPU, memory, and filesystem utilisation together
with per-link latency, jitter, packet loss, traffic rate, and failover state.
CPU is calculated from two consecutive host CPU samples; the first report is
explicitly marked as warming up rather than presenting a made-up percentage.

Packet loss and availability are retained across a configurable rolling window
(`INTERNET_PATH_WINDOW_MS`, five minutes by default). The dashboard displays
both the current poll and the sustained window, including consecutive failed
polls, outage start, and last successful sample.

## Link binding

A primary link without a binding is measured through the host's default route.
A backup link is only considered verified when its probe is bound to either an
interface or a source IP address. This prevents a backup probe from silently
using the primary ISP and creating a false failover result.

Use `sourceAddress` where possible, particularly on Windows. On Linux,
`interfaceName` also binds the probe and supplies interface-specific traffic
counters. Windows resolves `interfaceName` through `Get-NetAdapterStatistics`.

```json
[
  {
    "id": "primary",
    "role": "primary",
    "ispName": "ISP A",
    "interfaceName": "eth0",
    "gatewayAddress": "192.0.2.1",
    "publicIpEndpoint": "https://monitoring.example.com/public-ip",
    "targets": ["https://example.com/health"],
    "contractedDownMbps": 100,
    "contractedUpMbps": 50
  },
  {
    "id": "backup",
    "role": "backup",
    "ispName": "ISP B",
    "sourceAddress": "192.0.2.10",
    "interfaceName": "Ethernet 2",
    "gatewayAddress": "192.0.2.2",
    "publicIpEndpoint": "https://monitoring.example.com/public-ip",
    "targets": ["https://example.com/health"],
    "contractedDownMbps": 50,
    "contractedUpMbps": 25
  }
]
```

Set this JSON in `INTERNET_LINKS_JSON`. `EDGE_HEALTH_DISK_PATH` selects the
filesystem measured for edge capacity; it defaults to the agent working
directory.

## Gateway, last-mile, and public-IP evidence

When `gatewayAddress` is configured, the agent separately probes the local
gateway/modem. External failure with a reachable gateway over at least two
polls is classified as `upstream_suspected`; an unreachable gateway is
classified separately. This is diagnostic evidence, not carrier confirmation.
Definitive ISP outage confirmation still requires a carrier API, modem SNMP,
or provider event feed.

`publicIpEndpoint` must return an IP as plain text or `{ "ip": "..." }`. The
request follows the same route binding as the link probe. The agent retains the
previous address and change timestamp.

## Field acceptance

Synthetic tests exercise 400 branches, but they are not field results. Capture
at least 24 hours of real evidence in the format documented under
`test/internet-health`, exercise primary failure and recovery at the required
pilot branches, then run `npm run test:internet:acceptance` with
`INTERNET_EDGE_EVIDENCE` pointing to that JSON file.
