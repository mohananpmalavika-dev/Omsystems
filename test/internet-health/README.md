# Internet and Edge Field Acceptance

The automated suite includes a 400-branch synthetic contract test. It verifies scale-oriented processing logic only; it is not evidence that 400 deployed branches or carrier failover paths have been tested.

For field acceptance, capture at least 24 hours of samples in this shape:

```json
{
  "target": {
    "expectedBranches": 400,
    "minimumDurationHours": 24,
    "expectedFailoverBranches": 10,
    "minimumPathWindowSeconds": 300
  },
  "samples": [
    {
      "branchId": "branch-id",
      "observedAt": "2026-07-30T10:00:00.000Z",
      "links": [
        {
          "role": "primary",
          "status": "online",
          "connectivity": true,
          "routeVerified": true,
          "probeWindowSeconds": 300,
          "probeWindowAttempts": 30,
          "gatewayReachable": true,
          "lastMileStatus": "healthy",
          "publicIp": "198.51.100.10"
        },
        {
          "role": "backup",
          "status": "online",
          "connectivity": true,
          "routeVerified": true,
          "probeWindowSeconds": 300,
          "probeWindowAttempts": 30,
          "gatewayReachable": true,
          "lastMileStatus": "healthy",
          "publicIp": "203.0.113.20"
        }
      ],
      "edge": {
        "cpuUsedPercent": 25,
        "memoryUsedPercent": 40,
        "diskUsedPercent": 50,
        "diskFreeBytes": 1000000000,
        "uptimeSeconds": 86400
      }
    }
  ]
}
```

The same branch must show primary online, then primary offline with a verified reachable backup, then primary recovered. Run:

```bash
INTERNET_EDGE_EVIDENCE=/secure/path/evidence.json npm run test:internet:acceptance
```

The gate checks 400-branch inventory, duration, primary/backup route binding, rolling path samples, gateway evidence, route-specific public IPs, complete edge-resource measurements, and sustained failover/recovery. Keep real evidence outside the repository because it contains branch and network identifiers.
