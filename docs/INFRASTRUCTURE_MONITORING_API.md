# Infrastructure Monitoring API Documentation

## Overview

The Infrastructure Monitoring API provides comprehensive endpoints for monitoring enterprise infrastructure including switches, firewalls, UPS devices, generators, network links, VPN tunnels, and more. It exposes health scoring, real-time metrics, alerts, predictive maintenance, and network topology data.

## Base URL

```
/v1/infrastructure
```

## Authentication

All endpoints require tenant authentication via the `req.context.tenantId` property set by upstream middleware.

---

## Table of Contents

1. [Health Scoring Endpoints](#health-scoring-endpoints)
2. [Alerts Endpoints](#alerts-endpoints)
3. [Device Metrics Endpoints](#device-metrics-endpoints)
4. [Predicted Failures](#predicted-failures)
5. [Availability Metrics](#availability-metrics)
6. [Network Topology](#network-topology)
7. [Metrics History](#metrics-history)

---

## Health Scoring Endpoints

### GET /health/:branchId

Calculate and return comprehensive infrastructure health score for a branch.

**Parameters:**
- `branchId` (path) - Branch resource ID

**Response:**
```json
{
  "success": true,
  "data": {
    "branchId": "branch-123",
    "branchName": "Downtown Branch",
    "overallScore": 87,
    "overallStatus": "healthy",
    "domains": {
      "power": {
        "score": 92,
        "status": "healthy",
        "componentCount": 3,
        "healthyComponents": 3,
        "warningComponents": 0,
        "criticalComponents": 0,
        "details": {
          "upsScore": 95,
          "generatorScore": 90,
          "powerQualityScore": 88,
          "upsOnBattery": 0
        }
      },
      "network": {
        "score": 85,
        "status": "healthy",
        "componentCount": 8,
        "healthyComponents": 7,
        "warningComponents": 1,
        "criticalComponents": 0,
        "details": {
          "switchScore": 88,
          "firewallScore": 82,
          "linkScore": 85
        }
      },
      "compute": { "score": 90, "status": "healthy", ... },
      "storage": { "score": 78, "status": "warning", ... },
      "cooling": { "score": 95, "status": "healthy", ... },
      "security": { "score": 88, "status": "healthy", ... },
      "surveillance": { "score": 92, "status": "healthy", ... }
    },
    "criticalIssues": 0,
    "warningIssues": 2,
    "predictedFailures": 1,
    "lastUpdated": "2026-07-31T10:30:00Z"
  }
}
```

**Health Scoring Algorithm:**
- **Overall Score**: Weighted average of 7 domain scores
  - Power: 20%
  - Network: 25%
  - Compute: 15%
  - Storage: 15%
  - Cooling: 10%
  - Security: 10%
  - Surveillance: 5%

**Status Thresholds:**
- `healthy`: 90-100
- `warning`: 70-89
- `critical`: 0-69

---

### GET /health/tenant/summary

Get tenant-wide infrastructure health summary across all branches.


**Response:**
```json
{
  "success": true,
  "data": {
    "tenantId": "tenant-456",
    "totalBranches": 125,
    "averageScore": 86,
    "healthyBranches": 98,
    "warningBranches": 22,
    "criticalBranches": 5,
    "domainAverages": {
      "power": 89,
      "network": 85,
      "compute": 91,
      "storage": 82,
      "cooling": 93,
      "security": 87,
      "surveillance": 90
    },
    "totalCriticalAlerts": 12,
    "totalWarningAlerts": 47,
    "predictedFailuresCount": 8,
    "lastUpdated": "2026-07-31T10:30:00Z"
  }
}
```

---

### GET /health/trend/:branchId

Get infrastructure health score trend over time.

**Parameters:**
- `branchId` (path) - Branch resource ID
- `startDate` (query, required) - ISO 8601 date string
- `endDate` (query, required) - ISO 8601 date string
- `interval` (query, optional) - `hour` or `day` (default: `hour`)

**Example Request:**
```
GET /v1/infrastructure/health/trend/branch-123?startDate=2026-07-24T00:00:00Z&endDate=2026-07-31T23:59:59Z&interval=day
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2026-07-31T00:00:00Z",
      "overallScore": 87,
      "powerScore": 92,
      "networkScore": 85,
      "computeScore": 90,
      "storageScore": 78,
      "coolingScore": 95,
      "securityScore": 88,
      "surveillanceScore": 92
    },
    {
      "timestamp": "2026-07-30T00:00:00Z",
      "overallScore": 89,
      ...
    }
  ]
}
```

---

### POST /health/calculate-all

Trigger health score calculation for all branches in tenant.

**Response:**
```json
{
  "success": true,
  "message": "Infrastructure health calculation started for all branches"
}
```

**Note:** This is an asynchronous operation. Health scores are calculated in the background.

---

## Alerts Endpoints

### GET /alerts

Get infrastructure alerts with filtering and pagination.

**Query Parameters:**
- `branchId` (optional) - Filter by branch
- `severity` (optional) - `critical`, `warning`, or `info`
- `componentType` (optional) - `switch`, `firewall`, `ups`, `generator`, etc.
- `status` (optional) - `active`, `acknowledged`, or `resolved` (default: `active`)
- `page` (optional) - Page number (default: 1)
- `limit` (optional) - Results per page (default: 50, max: 100)

**Example Request:**
```
GET /v1/infrastructure/alerts?severity=critical&status=active&page=1&limit=20
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "alert-789",
      "tenantId": "tenant-456",
      "branchId": "branch-123",
      "branchName": "Downtown Branch",
      "severity": "critical",
      "componentType": "ups",
      "componentId": "ups-001",
      "componentName": "UPS-Floor-1",
      "alertType": "on_battery",
      "message": "UPS is running on battery power",
      "details": {
        "batteryHealth": 85,
        "estimatedRuntime": 15,
        "load": 45
      },
      "impact": "Branch surveillance system at risk if power not restored within 15 minutes",
      "recommendedAction": "Check utility power status. Verify generator startup. Monitor battery runtime.",
      "status": "active",
      "detectedAt": "2026-07-31T10:15:00Z",
      "acknowledgedAt": null,
      "acknowledgedBy": null,
      "resolvedAt": null,
      "resolvedBy": null,
      "resolutionNotes": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 47,
    "totalPages": 3
  }
}
```

---

### GET /alerts/summary

Get alert summary counts by severity and component type.

**Query Parameters:**
- `branchId` (optional) - Filter by branch

**Response:**
```json
{
  "success": true,
  "data": {
    "critical_active": 12,
    "warning_active": 35,
    "info_active": 8,
    "acknowledged": 15,
    "resolved": 234,
    "by_component_type": {
      "switch": 8,
      "firewall": 5,
      "ups": 3,
      "generator": 1,
      "storage": 4
    }
  }
}
```

---

### PATCH /alerts/:alertId/acknowledge

Acknowledge an alert.

**Parameters:**
- `alertId` (path) - Alert ID

**Response:**
```json
{
  "success": true,
  "message": "Alert acknowledged successfully"
}
```

---

### PATCH /alerts/:alertId/resolve

Resolve an alert.

**Parameters:**
- `alertId` (path) - Alert ID

**Body:**
```json
{
  "resolutionNotes": "Replaced UPS battery. System back to normal."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Alert resolved successfully"
}
```

---

## Device Metrics Endpoints

### GET /switches/:branchId

Get all network switches for a branch with latest health metrics.

**Parameters:**
- `branchId` (path) - Branch resource ID

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "switch-001",
      "tenantId": "tenant-456",
      "branchId": "branch-123",
      "name": "Core-Switch-01",
      "ipAddress": "192.168.1.10",
      "snmpCommunity": "[REDACTED]",
      "snmpVersion": "2c",
      "vendor": "cisco",
      "model": "Catalyst 2960X",
      "location": "Server Room",
      "portCount": 48,
      "poeCapable": true,
      "poeMaxWatts": 740,
      "healthScore": 92,
      "healthStatus": "healthy",
      "cpuUsagePercent": 12.5,
      "memoryUsagePercent": 35.2,
      "temperatureCelsius": 42.0,
      "poeUtilizationPercent": 58.5,
      "portsUp": 42,
      "portsDown": 6,
      "lastMetricsAt": "2026-07-31T10:25:00Z",
      "createdAt": "2026-01-15T08:00:00Z",
      "updatedAt": "2026-07-31T10:25:00Z"
    }
  ]
}
```

---

### GET /switches/:switchId/ports

Get port-level metrics for a specific switch.

**Parameters:**
- `switchId` (path) - Switch ID

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "portNumber": 1,
      "portName": "GigabitEthernet1/0/1",
      "adminStatus": "up",
      "operStatus": "up",
      "speedMbps": 1000,
      "poeEnabled": true,
      "poePowerWatts": 15.4,
      "poeDeviceDetected": true,
      "connectedDeviceType": "ip_camera",
      "utilizationPercent": 35.2,
      "rxBytes": 458362847562,
      "txBytes": 123847562348,
      "rxErrors": 0,
      "txErrors": 0,
      "observedAt": "2026-07-31T10:25:00Z"
    }
  ]
}
```

---

### GET /firewalls/:branchId

Get all firewalls for a branch with latest health metrics.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "fw-001",
      "tenantId": "tenant-456",
      "branchId": "branch-123",
      "name": "FortiGate-100F",
      "ipAddress": "192.168.1.1",
      "vendor": "fortinet",
      "model": "FortiGate-100F",
      "firmwareVersion": "7.4.1",
      "haEnabled": true,
      "haRole": "primary",
      "maxSessions": 500000,
      "healthScore": 88,
      "healthStatus": "healthy",
      "cpuUsagePercent": 22.5,
      "memoryUsagePercent": 45.8,
      "sessionCount": 12584,
      "sessionUtilizationPercent": 2.5,
      "threatsBlockedLastHour": 47,
      "ipsStatus": "enabled",
      "avStatus": "enabled",
      "vpnTunnelsUp": 8,
      "vpnTunnelsDown": 0,
      "haSyncStatus": "in_sync",
      "lastMetricsAt": "2026-07-31T10:25:00Z"
    }
  ]
}
```

---

### GET /ups/:branchId

Get all UPS devices for a branch with latest health metrics.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "ups-001",
      "tenantId": "tenant-456",
      "branchId": "branch-123",
      "name": "APC-SmartUPS-3000",
      "ipAddress": "192.168.1.50",
      "vendor": "apc",
      "model": "Smart-UPS 3000VA",
      "serialNumber": "AS1234567890",
      "ratedPowerWatts": 2700,
      "batteryInstallationDate": "2024-03-15",
      "healthScore": 92,
      "healthStatus": "healthy",
      "batteryHealthPercent": 95,
      "batteryAgeDays": 503,
      "estimatedRuntimeMinutes": 45,
      "runningOnBattery": false,
      "utilityPowerAvailable": true,
      "loadPercent": 48,
      "loadWatts": 1296,
      "batteryReplacementIndicator": false,
      "predictedReplacementDays": 732,
      "lastSelfTestResult": "passed",
      "lastMetricsAt": "2026-07-31T10:25:00Z"
    }
  ]
}
```

---

## Predicted Failures

### GET /predicted-failures/:branchId

Get all predicted infrastructure failures for a branch.

**Parameters:**
- `branchId` (path) - Branch resource ID

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "failureType": "ups_battery",
      "componentId": "ups-002",
      "componentName": "APC-SmartUPS-Floor2",
      "description": "UPS Battery Replacement Required",
      "daysUntilFailure": 45,
      "healthIndicator": 72,
      "observedAt": "2026-07-31T10:00:00Z"
    },
    {
      "failureType": "disk_failure",
      "componentId": "nvr-disk-003",
      "componentName": "NVR-Disk-3",
      "description": "Disk Failure Predicted",
      "daysUntilFailure": null,
      "healthIndicator": 65,
      "observedAt": "2026-07-31T09:45:00Z"
    },
    {
      "failureType": "generator_maintenance",
      "componentId": "gen-001",
      "componentName": "Kohler-20kW",
      "description": "Generator Maintenance Due",
      "daysUntilFailure": 7,
      "healthIndicator": null,
      "observedAt": "2026-07-31T08:00:00Z"
    }
  ]
}
```

**Failure Types:**
- `ups_battery` - UPS battery replacement needed
- `disk_failure` - Hard disk SMART failure prediction
- `generator_maintenance` - Generator preventive maintenance due

---

### GET /ups/:upsId/battery-forecast

Get detailed battery replacement prediction and maintenance schedule for a UPS.

**Parameters:**
- `upsId` (path) - UPS device ID

**Response:**
```json
{
  "success": true,
  "data": {
    "upsName": "APC-SmartUPS-Floor2",
    "branchId": "branch-123",
    "branchName": "Downtown Branch",
    "batteryHealthPercent": 72,
    "batteryAgeDays": 1095,
    "batteryReplacementIndicator": true,
    "predictedReplacementDays": 45,
    "lastSelfTestResult": "warning",
    "lastSelfTestDate": "2026-07-28T02:00:00Z",
    "batteryInstallationDate": "2023-07-31",
    "observedAt": "2026-07-31T10:00:00Z"
  }
}
```

**AI-Powered Prediction Algorithm:**
- Battery health < 80%: Replacement within 90 days
- Battery age > 3 years + health < 85%: Replacement within 180 days
- Failed self-test: Immediate replacement
- Battery health < 70%: Replacement within 30 days

---

## Availability Metrics

### GET /availability/:branchId

Get infrastructure availability metrics for a branch.

**Parameters:**
- `branchId` (path) - Branch resource ID
- `periodType` (query, optional) - `hour`, `day`, `week`, or `month` (default: `day`)
- `limit` (query, optional) - Number of periods to return (default: 30)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "periodStart": "2026-07-31T00:00:00Z",
      "periodEnd": "2026-07-31T23:59:59Z",
      "periodType": "day",
      "availabilityPercent": 99.87,
      "totalUptimeSeconds": 86298,
      "totalDowntimeSeconds": 102,
      "powerOutageCount": 1,
      "networkOutageCount": 0,
      "mtbfHours": 720.5,
      "mttrHours": 0.028
    }
  ]
}
```

**Metrics Explained:**
- `availabilityPercent` - Percentage of time infrastructure was operational
- `mtbfHours` - Mean Time Between Failures
- `mttrHours` - Mean Time To Repair
- Target SLA: 99.9% availability (8.76 hours downtime/year)

---

## Network Topology

### GET /topology/:branchId

Get network topology connections for a branch.

**Parameters:**
- `branchId` (path) - Branch resource ID

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "topo-001",
      "tenantId": "tenant-456",
      "branchId": "branch-123",
      "sourceDeviceId": "fw-001",
      "sourceDeviceType": "firewall",
      "sourceDeviceName": "FortiGate-100F",
      "sourceInterface": "port1",
      "targetDeviceId": "switch-001",
      "targetDeviceType": "switch",
      "targetDeviceName": "Core-Switch-01",
      "targetInterface": "GigabitEthernet1/0/48",
      "connectionType": "ethernet",
      "linkSpeed": "1000",
      "vlanId": null,
      "discoveredAt": "2026-07-31T08:00:00Z",
      "lastSeenAt": "2026-07-31T10:25:00Z"
    }
  ]
}
```

**Connection Types:**
- `ethernet` - Physical Ethernet connection
- `fiber` - Fiber optic connection
- `wireless` - Wireless connection
- `vpn` - VPN tunnel
- `sdwan` - SD-WAN link

---

## Metrics History

### GET /metrics/switch/:switchId/history

Get historical health metrics for a switch.

**Parameters:**
- `switchId` (path) - Switch ID
- `startDate` (query, optional) - ISO 8601 date string
- `endDate` (query, optional) - ISO 8601 date string
- `limit` (query, optional) - Max records (default: 100, max: 1000)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "observedAt": "2026-07-31T10:25:00Z",
      "cpuUsagePercent": 12.5,
      "memoryUsagePercent": 35.2,
      "temperatureCelsius": 42.0,
      "poeUtilizationPercent": 58.5,
      "portsUp": 42,
      "portsDown": 6,
      "healthScore": 92
    }
  ]
}
```

---

### GET /metrics/firewall/:firewallId/history

Get historical health metrics for a firewall.

**Parameters:**
- `firewallId` (path) - Firewall ID
- `startDate` (query, optional) - ISO 8601 date string
- `endDate` (query, optional) - ISO 8601 date string
- `limit` (query, optional) - Max records (default: 100, max: 1000)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "observedAt": "2026-07-31T10:25:00Z",
      "cpuUsagePercent": 22.5,
      "memoryUsagePercent": 45.8,
      "sessionCount": 12584,
      "sessionUtilizationPercent": 2.5,
      "threatsBlockedLastHour": 47,
      "ipsStatus": "enabled",
      "avStatus": "enabled",
      "vpnTunnelsUp": 8,
      "vpnTunnelsDown": 0,
      "healthScore": 88
    }
  ]
}
```

---

### GET /metrics/ups/:upsId/history

Get historical health metrics for a UPS.

**Parameters:**
- `upsId` (path) - UPS ID
- `startDate` (query, optional) - ISO 8601 date string
- `endDate` (query, optional) - ISO 8601 date string
- `limit` (query, optional) - Max records (default: 100, max: 1000)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "observedAt": "2026-07-31T10:25:00Z",
      "batteryHealthPercent": 95,
      "batteryAgeDays": 503,
      "estimatedRuntimeMinutes": 45,
      "runningOnBattery": false,
      "utilityPowerAvailable": true,
      "loadPercent": 48,
      "loadWatts": 1296,
      "inputVoltage": 230.5,
      "outputVoltage": 230.2,
      "batteryReplacementIndicator": false,
      "predictedReplacementDays": 732,
      "healthScore": 92
    }
  ]
}
```

---

## Error Responses

All endpoints return consistent error responses:

**401 Unauthorized:**
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "Device not found"
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "error": "Failed to fetch infrastructure health"
}
```

---

## Rate Limiting

- Standard endpoints: 100 requests/minute per tenant
- Heavy endpoints (calculate-all, topology): 10 requests/minute per tenant
- Metrics history endpoints: 50 requests/minute per tenant

---

## WebSocket Support (Future)

Real-time infrastructure updates will be available via WebSocket at:

```
wss://api.sentinelgrid.com/v1/infrastructure/stream
```

**Events:**
- `health:updated` - Health score recalculated
- `alert:new` - New alert detected
- `alert:resolved` - Alert resolved
- `metrics:updated` - Device metrics updated
- `topology:changed` - Network topology changed

---

## Integration Examples

### Fetch Branch Health Score

```typescript
const response = await fetch('/v1/infrastructure/health/branch-123', {
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  }
});

const { data } = await response.json();
console.log(`Overall Health: ${data.overallScore}`);
console.log(`Power Domain: ${data.domains.power.score}`);
```

### Monitor Critical Alerts

```typescript
const response = await fetch(
  '/v1/infrastructure/alerts?severity=critical&status=active',
  {
    headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
  }
);

const { data } = await response.json();
data.forEach(alert => {
  console.log(`${alert.componentName}: ${alert.message}`);
  console.log(`Action: ${alert.recommendedAction}`);
});
```

### Track UPS Battery Replacements

```typescript
const response = await fetch(
  '/v1/infrastructure/predicted-failures/branch-123',
  {
    headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
  }
);

const { data } = await response.json();
const batteryReplacements = data.filter(f => f.failureType === 'ups_battery');
console.log(`${batteryReplacements.length} batteries need replacement`);
```

---

## Support

For API support, contact: devops@sentinelgrid.com

For infrastructure monitoring issues, contact: operations@sentinelgrid.com
