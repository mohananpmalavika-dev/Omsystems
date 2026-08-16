# Historical SLA Metrics & Daily Health Aggregation Subsystem Architecture

## 1. Executive Overview

In an enterprise banking surveillance network (400+ branches, 16,000+ cameras), snapshots alone cannot establish compliance for management and regulators.

A bank requires provable historical SLA metrics:
- **Camera Availability**: $\ge 99.50\%$
- **Recording Availability**: $\ge 99.90\%$
- **Recorder Availability**: $\ge 99.90\%$
- **Internet WAN Uptime**: $\ge 99.50\%$
- **Retention Compliance**: $100.00\%$ ($\ge 90$ days)
- **P1 Alert Acknowledgement**: $\le 60$ seconds
- **P1 Alert Resolution**: $\le 15$ minutes

```
               Edge Telemetry / Probes (Every 30s)
                              │
                              ▼
            State-Transition History (No Flapping)
          (StartedAt, EndedAt, Reason, EntityType)
                              │
                              ▼
                 Daily SLA Aggregator Worker
               (Timezone-aware 00:00 - 23:59)
                              │
          ┌───────────────────┴───────────────────┐
          ▼                                       ▼
 camera_health_daily                      branch_health_daily
(Per-camera downtime &                 (Weighted roll-up, alert SLA,
 retention compliance)                 breaches, duration seconds)
          │                                       │
          └───────────────────┬───────────────────┘
                              ▼
                    Fleet Weighted Summary
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
     PDF Reports         XLSX Reports        CSV Reports
```

---

## 2. Fundamental Architectural Rules

### 2.1 Two Distinct Data Layers
1. **Live Dashboard Layer**: Uses current status tables for active operators.
2. **Historical Management Layer**: Uses daily aggregated records (`branch_health_daily`, `camera_health_daily`) for trends and audit reporting.

### 2.2 Duration-Based Math (Never Average Percentages)
Averages of percentages produce mathematical errors when time windows differ. The platform strictly aggregates cumulative durations:
$$\text{Availability \%} = \frac{\sum \text{availableSeconds}}{\sum \text{monitoredSeconds}} \times 100$$

### 2.3 Separation of Component Availability
- **Camera Availability**: Video frame decoding and stream validity.
- **Recording Availability**: Confirmation of physical disk write streams.
- **Recorder Availability**: NVR/DVR reachability and management API health.
- **Internet Availability**: WAN uptime (Primary ISP + LTE Backup failover).

### 2.4 Monitoring Coverage & Telemetry Gap Safeguards
If monitoring coverage drops below $95\%$, the SLA status is marked `UNKNOWN` rather than falsely asserting $100\%$ uptime.

---

## 3. REST Control-Plane APIs

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/sla/branches/daily` | `GET` | List daily branch health records by date and region. |
| `/api/v1/sla/branches/:id/history` | `GET` | 7-day, 30-day, or 90-day daily SLA time-series for trend charts. |
| `/api/v1/sla/branches/:id/cameras/daily` | `GET` | Per-camera drill-down breakdown for any reporting date. |
| `/api/v1/sla/fleet/summary` | `GET` | Enterprise/regional weighted roll-up and worst-performing branch ranking. |
| `/api/v1/sla/aggregate` | `POST` | On-demand or scheduled trigger for daily aggregation calculations. |
| `/api/v1/sla/reports/daily-export` | `GET` | JSON/CSV export formatted for automated report generation. |
