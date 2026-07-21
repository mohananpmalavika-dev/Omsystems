# Maintenance Module 2.8 - API Quick Reference

## Dashboard & Health Monitoring

### System Health Overview
```
GET /v1/maintenance/dashboard/health
Response: {
  healthPercentage: 98,
  camerasOnline: 542,
  camerasOffline: 3,
  storageAlerts: 5,
  recordingIssues: 2,
  amcExpiring: 8,
  overdueMaintenanceCount: 14,
  openWorkOrders: 19
}
```

### Maintenance Status
```
GET /v1/maintenance/dashboard/status
Response: {
  totalAssets: 547,
  assetsOnline: 542,
  assetsOffline: 3,
  assetsDegraded: 2,
  workOrdersOpen: 19,
  workOrdersOverdueSla: 2,
  scheduledMaintenanceCount: 24,
  visitsPending: 14,
  visitsOverdue: 3,
  amcContractsActive: 8,
  amcContractsExpiring: 2,
  criticalAlerts: 1,
  warningAlerts: 5
}
```

## Health Monitoring by Component

### Camera Health
```
GET /v1/maintenance/health/cameras?limit=50
Response: {
  data: [
    {
      id: "uuid",
      name: "Main Entrance",
      serialNumber: "SN123456",
      status: "operational",
      lastCheck: "2026-07-21T10:30:00Z",
      fps: 30,
      bitrate: 2048,
      temperature: 42,
      recordingRunning: true
    }
  ]
}
```

### Storage Health
```
GET /v1/maintenance/health/storage
Response: {
  data: [
    {
      id: "uuid",
      name: "NAS-01",
      category: "storage",
      status: "healthy",
      totalCapacityGb: 10000,
      usedCapacityGb: 7500,
      usagePercentage: 75,
      lastCheck: "2026-07-21T10:30:00Z"
    }
  ]
}
```

### Network Status
```
GET /v1/maintenance/health/network
Response: {
  data: [
    {
      id: "network-1",
      name: "Branch Network",
      latencyMs: 25,
      packetLoss: 0.1,
      jitter: 5,
      status: "healthy",
      lastCheck: "2026-07-21T10:30:00Z"
    }
  ]
}
```

### Power/UPS Status
```
GET /v1/maintenance/health/power
Response: {
  data: [
    {
      id: "uuid",
      name: "UPS-01",
      category: "power",
      batteryHealthPercent: 95,
      runtimeMinutes: 480,
      status: "operational",
      lastCheck: "2026-07-21T10:30:00Z"
    }
  ]
}
```

## Firmware Management

### List Required Updates
```
GET /v1/maintenance/firmware/updates-required
Response: {
  data: [
    {
      id: "uuid",
      assetId: "uuid",
      deviceType: "camera",
      currentVersion: "1.2.3",
      latestVersion: "1.2.5",
      requiresUpdate: true,
      criticalUpdate: false,
      lastCheckAt: "2026-07-21T10:30:00Z"
    }
  ]
}
```

### Check for Updates
```
POST /v1/maintenance/firmware/check
Request Body: {
  assetIds: ["uuid1", "uuid2"]  // optional
}
Response: {
  message: "Firmware check initiated",
  status: "in-progress"
}
```

### Initiate Firmware Upgrade
```
POST /v1/maintenance/firmware/upgrade
Request Body: {
  assetId: "uuid",
  fromVersion: "1.2.3",
  toVersion: "1.2.5"
}
Response: {
  message: "Firmware upgrade initiated",
  assetId: "uuid",
  status: "in-progress"
}
```

## Spare Parts Management

### List Spare Parts
```
GET /v1/maintenance/spare-parts?category=camera
Response: {
  data: [
    {
      id: "uuid",
      partName: "Hikvision Lens 4mm",
      partCode: "HK-LENS-4MM",
      category: "camera",
      quantity: 12,
      reorderLevel: 5,
      unitCost: 45.00,
      location: "Warehouse A",
      lastUpdated: "2026-07-21T10:30:00Z"
    }
  ]
}
```

### Add Spare Part
```
POST /v1/maintenance/spare-parts/add
Request Body: {
  partName: "Hikvision Lens 4mm",
  quantity: 10
}
Response: {
  message: "Spare part recorded"
}
```

### Low Stock Alert
```
GET /v1/maintenance/spare-parts/low-stock
Response: {
  data: [
    {
      id: "uuid",
      partName: "HDD 2TB",
      partCode: "SEAGATE-2TB",
      category: "storage",
      quantity: 3,
      reorderLevel: 10,
      unitCost: 85.00,
      location: "Warehouse B"
    }
  ]
}
```

## Maintenance Reporting

### Generate Report
```
POST /v1/maintenance/reports/generate
Request Body: {
  reportType: "preventive",  // preventive | corrective | amc | health | trend
  periodStart: "2026-07-01",
  periodEnd: "2026-07-31"
}
Response: {
  id: "uuid",
  reportType: "preventive",
  periodStart: "2026-07-01",
  periodEnd: "2026-07-31",
  metrics: {
    scheduledVisits: 24,
    completedVisits: 22,
    overdueVisits: 2
  },
  summary: "Preventive maintenance report for 2026-07-01 to 2026-07-31",
  generatedAt: "2026-07-21T10:30:00Z",
  filename: "preventive-report-2026-07-21.pdf"
}
```

### List Reports
```
GET /v1/maintenance/reports?reportType=preventive&limit=10
Response: {
  data: [
    {
      id: "uuid",
      reportType: "preventive",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      metrics: { ... },
      generatedAt: "2026-07-21T10:30:00Z"
    }
  ]
}
```

### SLA Compliance Report
```
GET /v1/maintenance/reports/sla-compliance
Response: {
  totalWorkOrders: 25,
  completedOnTime: 23,
  compliancePercentage: 92,
  breaches: 2
}
```

### Maintenance Metrics
```
GET /v1/maintenance/reports/metrics
Response: {
  compliant: true,
  overdueMaintenanceCount: 2,
  openIssuesCount: 3,
  criticalAlertsCount: 1,
  status: "compliant"
}
```

## Predictive Maintenance

### High-Risk Assets
```
GET /v1/maintenance/predictive/high-risk
Response: {
  data: [
    {
      id: "uuid",
      assetId: "uuid",
      alertType: "hdd_failure_risk",
      failureProbability: 0.85,
      estimatedFailureDays: 7,
      recommendation: "Replace HDD within 7 days",
      severity: "critical",
      status: "open",
      detectedAt: "2026-07-21T08:00:00Z"
    }
  ],
  totalHighRiskAssets: 3
}
```

### Failure Forecast
```
GET /v1/maintenance/predictive/failure-forecast
Response: {
  data: [
    {
      id: "uuid",
      assetId: "uuid",
      alertType: "battery_degradation",
      failureProbability: 0.72,
      estimatedFailureDays: 14,
      recommendation: "Schedule UPS battery replacement",
      severity: "high",
      status: "open",
      detectedAt: "2026-07-21T08:00:00Z"
    }
  ]
}
```

## Existing Maintenance Endpoints

### Assets
```
GET    /v1/maintenance/assets
GET    /v1/maintenance/assets/:id
POST   /v1/maintenance/assets
PATCH  /v1/maintenance/assets/:id
```

### Work Orders
```
GET    /v1/maintenance/workorders
GET    /v1/maintenance/workorders/:id
POST   /v1/maintenance/workorders
PATCH  /v1/maintenance/workorders/:id
```

### Vendors
```
GET    /v1/maintenance/vendors
GET    /v1/maintenance/vendors/:id
POST   /v1/maintenance/vendors
PATCH  /v1/maintenance/vendors/:id
```

### AMC Contracts
```
GET    /v1/maintenance/amc
GET    /v1/maintenance/amc/:id
POST   /v1/maintenance/amc
PATCH  /v1/maintenance/amc/:id
```

### Plans & Schedules
```
POST   /v1/maintenance/plans
GET    /v1/maintenance/plans
POST   /v1/maintenance/schedules
GET    /v1/maintenance/schedules
POST   /v1/maintenance/visits
GET    /v1/maintenance/visits
PATCH  /v1/maintenance/visits/:id
POST   /v1/maintenance/predictive-alerts
GET    /v1/maintenance/predictive-alerts
```

---

**Total New Endpoints**: 20+
**Total Enhanced Endpoints**: 13
**Total Maintenance Endpoints**: 33+
