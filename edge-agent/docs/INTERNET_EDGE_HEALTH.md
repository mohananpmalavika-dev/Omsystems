# Internet and Edge Health Evidence

The edge agent reports host CPU, memory, and filesystem utilisation together
with per-link latency, jitter, packet loss, traffic rate, and failover state.
CPU is calculated from two consecutive host CPU samples; the first report is
explicitly marked as warming up rather than presenting a made-up percentage.

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
    "targets": ["https://example.com/health"],
    "contractedDownMbps": 50,
    "contractedUpMbps": 25
  }
]
```

Set this JSON in `INTERNET_LINKS_JSON`. `EDGE_HEALTH_DISK_PATH` selects the
filesystem measured for edge capacity; it defaults to the agent working
directory.
