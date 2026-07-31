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
