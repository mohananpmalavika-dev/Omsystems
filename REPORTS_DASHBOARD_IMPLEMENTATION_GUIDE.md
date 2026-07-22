# CCTV Reports & Executive Dashboard - Implementation Guide

## Overview

The CCTV Reports & Executive Dashboard module (Module 2.11) provides comprehensive operational intelligence through role-based dashboards, automated reports, and executive analytics. This system transforms raw camera and system data into actionable information for all stakeholders.

## Architecture

```
Raw Data Sources
├── Cameras (status, health, connectivity)
├── Recording Engine (recording status, gaps)
├── Storage Systems (capacity, utilization)
├── Health Monitoring (metrics, events)
├── Incidents (occurrences, investigations)
├── Maintenance (work orders, downtime)
├── Access Logs (footage retrieval)
└── Alerts (active, escalated)
        ↓
Reporting Data Layer (aggregated metrics)
├── Daily summaries
├── Health scores
├── Capacity forecasts
└── Anomaly detection
        ↓
Dashboard & Reports
├── Live Dashboards (role-based)
├── Scheduled Reports (automated delivery)
├── Ad-hoc Reports (on-demand)
└── Exports (PDF, XLSX, CSV)
```

## Database Schema

### Core Tables

#### 1. Dashboard Definitions
Stores dashboard configurations for different roles.

```sql
dashboard_definitions
├── id (UUID)
├── tenant_id
├── name
├── slug
├── target_role (control_room_operator, branch_manager, etc.)
├── layout_config (JSONB)
└── is_active
```

#### 2. Report Definitions
Defines available report types and configurations.

```sql
report_definitions
├── id (UUID)
├── tenant_id
├── name
├── report_type (camera_health, recording_status, etc.)
├── category (operational, compliance, security, executive)
├── query_config (JSONB)
└── output_format (array)
```

#### 3. Operational Metrics Tables

**Camera Health Daily:**
- Daily aggregated camera health metrics
- Online/offline minutes, availability percentage
- Quality issues, tamper events

**Recording Status Daily:**
- Daily recording availability
- Gap count and duration
- Integrity verification status

**Storage Capacity Snapshots:**
- Real-time storage utilization
- Growth rate, forecast
- Node health status

**Downtime Events:**
- Asset outage tracking
- Planned vs unplanned downtime
- Root cause analysis

#### 4. System Health Scores
Transparent health scoring with component breakdown.

```sql
system_health_scores
├── overall_score
├── camera_availability_score (25% weight)
├── recording_availability_score (25% weight)
├── storage_health_score (15% weight)
├── network_health_score (10% weight)
└── [other components]
```

## API Endpoints

### Dashboard Endpoints

```
GET /v1/dashboard/summary
├── Returns: system status, health score, critical alerts
└── Updates: every 30 seconds

GET /v1/dashboard/camera-health
├── Returns: camera metrics, availability
└── Updates: every 15-30 seconds

GET /v1/dashboard/recording-status
├── Returns: recording metrics, gaps
└── Updates: every 1-5 minutes

GET /v1/dashboard/storage
├── Returns: capacity, utilization, forecast
└── Updates: every 1-5 minutes

GET /v1/dashboard/alerts
├── Returns: active alerts, unacknowledged
└── Updates: real-time

GET /v1/dashboard/incidents
├── Returns: recent high-priority incidents
└── Updates: real-time

GET /v1/dashboard/system-health
├── Returns: health score breakdown
└── Updates: every 15 minutes
```

### Report Endpoints

```
GET /v1/reports/camera-health
├── Filters: branchIds, dateRange
└── Returns: camera health details with summary

GET /v1/reports/recording-status
├── Filters: branchIds, dateRange
└── Returns: recording availability, gaps

GET /v1/reports/storage-utilization
├── Filters: branchIds
└── Returns: storage capacity, forecasts

GET /v1/reports/incidents
├── Filters: branchIds, dateRange, severity, status
└── Returns: incident register with metrics

GET /v1/reports/footage-access
├── Filters: branchIds, dateRange
└── Returns: audit trail of video access

GET /v1/reports/maintenance
├── Filters: branchIds, dateRange
└── Returns: work orders, SLA compliance

GET /v1/reports/downtime
├── Filters: branchIds, dateRange
└── Returns: downtime events, MTTR, MTBF

GET /v1/reports/alerts
├── Filters: branchIds, dateRange
└── Returns: alert summary, response times
```

## Role-Based Dashboards

### 1. Control Room Operator Dashboard
**Focus:** Real-time operational awareness

**Key Widgets:**
- Active alerts (unacknowledged first)
- Offline cameras (with duration)
- Recording failures
- Critical incidents
- SLA countdown timers
- Quick camera access shortcuts

**Refresh Rate:** 15-30 seconds

### 2. Branch Manager Dashboard
**Focus:** Branch-specific operational status

**Key Widgets:**
- Cameras at own branch
- Camera and recording status
- Storage utilization
- Recent incidents
- Open maintenance work
- Overdue inspections
- Compliance exceptions

**Refresh Rate:** 1-5 minutes

### 3. Regional Security Manager Dashboard
**Focus:** Regional overview and comparison

**Key Widgets:**
- Branch health comparison map
- Critical incidents across region
- Recurring failure analysis
- Vendor SLA performance
- Storage risks
- Regional compliance score
- Open corrective actions

**Refresh Rate:** 5-15 minutes

### 4. Compliance/Auditor Dashboard
**Focus:** Compliance evidence and audit trails

**Key Widgets:**
- Recording verification status
- Retention compliance
- Access logs summary
- Evidence retrieval activity
- Maintenance records compliance
- Incident register completeness
- Policy exceptions
- Compliance certificates

**Refresh Rate:** Hourly

### 5. Executive Management Dashboard
**Focus:** Strategic overview and risk trends

**Key Widgets:**
- Overall system health
- Critical incidents and impact
- Risk trends
- Regional performance comparison
- System downtime
- Storage capacity forecast
- Vendor performance
- Compliance posture
- Financial loss trends

**Refresh Rate:** Daily snapshots

## Core Reports

### 1. Camera Health Report
**Purpose:** Auditable camera condition tracking

**Fields:**
- Camera ID, name, branch, location
- Make, model, IP address
- Online status, last heartbeat
- Offline duration
- Video quality (frame rate, bitrate, latency)
- Recording status
- Tamper state, firmware version
- Maintenance state, overall health

**Filters:**
- Date range, region, branch
- Camera type, health state
- Offline duration, vendor
- Firmware version

**Output:** PDF, XLSX, CSV

### 2. Recording Status Report
**Purpose:** Recording availability verification

**Fields:**
- Camera, recording mode
- Expected vs available hours
- Availability percentage
- Gap count, total gap duration
- Largest gap
- Integrity verification status
- Retention compliance
- Legal hold status
- Storage destination

**Grouping:** Branch, camera, date, failure type

**Output:** PDF, XLSX, CSV

### 3. Storage Utilization Report
**Purpose:** Capacity planning and forecasting

**Fields:**
- Storage node, branch, type
- Total/used/available capacity
- Utilization percentage
- Daily growth rate
- Forecast exhaustion date
- RAID state, disk health
- Replication/backup status

**Visualizations:**
- Capacity trend charts
- Exhaustion forecasts
- Node comparison

**Output:** PDF, XLSX, CSV

### 4. Incident Register
**Purpose:** Complete incident audit trail

**Fields:**
- Incident number, date, branch
- Incident type, detection source
- Severity, description, status
- Investigator, response times
- Police/insurance references
- Estimated loss
- Evidence preservation status
- Legal hold status
- Corrective actions, closure date

**Summary Metrics:**
- Incidents by type/severity
- Open vs closed
- Average response/investigation time
- Police notifications
- Financial impact
- Branches with highest incidents

**Output:** PDF, XLSX, CSV

### 5. Footage Retrieval Log
**Purpose:** Video access audit trail

**Fields:**
- User, role, branch, camera
- Recording period requested
- Purpose, incident/case reference
- Action type (search, playback, export)
- Approval workflow
- Recipient (if shared externally)
- Watermark ID
- Download time, device, IP
- Result status

**Compliance:** Distinguishes internal vs external sharing

**Output:** PDF, XLSX, CSV (with data masking options)

### 6. Maintenance Log
**Purpose:** Work order tracking and vendor performance

**Fields:**
- Work order number
- Branch, asset, maintenance type
- Problem description, priority
- Vendor, technician
- Created/scheduled/visit dates
- Work completed, parts used
- Downtime duration
- SLA status, verification result
- Completion date, cost

**Summary Metrics:**
- Open/overdue work orders
- Preventive vs corrective
- Vendor performance
- Parts consumption
- Maintenance costs
- Repeat repairs

**Output:** PDF, XLSX, CSV

### 7. Downtime Report
**Purpose:** Availability analysis and MTTR/MTBF tracking

**Fields:**
- Asset/service, branch
- Downtime start/end, duration
- Planned vs unplanned
- Root cause, impact
- Cameras affected
- Incident/work order reference
- SLA breach status
- Corrective action

**Metrics:**
```
Availability % = (Operational time ÷ Total scheduled time) × 100
MTBF = Total operational time ÷ Number of failures
MTTR = Total repair time ÷ Number of repairs
```

**Output:** PDF, XLSX, CSV with trend charts

### 8. Alert Summary Report
**Purpose:** Alert management effectiveness

**Fields:**
- Alert ID, type, source
- Branch, camera, severity
- Trigger/acknowledgment/resolution times
- Assigned operator
- Escalation status
- Incident conversion
- False alarm flag
- Closure reason

**Summary Metrics:**
- Alerts by type/severity/branch
- Average acknowledgment time
- Average resolution time
- Escalation rate
- SLA breaches
- False alarm rate
- Alert-to-incident conversion

**Output:** PDF, XLSX, CSV

## System Health Scoring

### Transparent Calculation

**Weighted Components:**
```
Camera availability:         25% (online cameras / operational cameras)
Recording availability:      25% (recording normally / active cameras)
Storage health:              15% (capacity, growth, node health)
Network health:              10% (latency, connectivity)
Power and UPS health:        10% (power status, battery)
Integration health:           5% (external system connectivity)
Maintenance compliance:       5% (overdue work orders, PM completion)
Security and audit health:    5% (access violations, integrity failures)
```

**Health Status Classifications:**
- 95-100: Healthy (green)
- 85-94.99: Good (light green)
- 70-84.99: Warning (yellow)
- 50-69.99: Critical (orange)
- Below 50: Severe (red)

**Display Requirements:**
- Always show component breakdown
- Never show unexplained score
- Update every 15 minutes
- Store historical scores for trending

## Report Scheduling

### Supported Frequencies
- Daily (e.g., Camera health at 6 AM)
- Weekly (e.g., Storage forecast every Monday)
- Monthly (e.g., Incident register on 1st)
- Quarterly (e.g., Compliance assessment)
- Annual (e.g., Executive summary)
- Custom (cron expression)

### Delivery Methods
- In-app report library
- Email delivery (PDF/XLSX attachment)
- Secure download link (time-limited)
- SFTP (for approved integrations)

### Security Controls
- Scheduled reports respect user scope
- Regional managers see only authorized regions
- Sensitive reports require approval
- Export audit logging
- Watermarking for external sharing
- Download count tracking
- Revocation capability

## Data Freshness Indicators

Every widget and report must show data age:

```
✓ Fresh (< 1 minute)
⚠ Delayed (1-5 minutes)
⚠ Stale (> 5 minutes)
✗ Unavailable
```

**Example Display:**
```
Camera status: updated 18 seconds ago
Recording verification: completed 3 minutes ago
Storage capacity: updated 1 minute ago
Incident register: real-time
Maintenance data: updated 12 minutes ago
```

## Drill-Down Experience

Users should be able to click any metric to see details:

```
System health: 84% [Click]
    ↓
Recording health: 72% [Click]
    ↓
Kerala region: 68% [Click]
    ↓
Kollam Main: 51% [Click]
    ↓
3 cameras not recording [Click]
    ↓
Camera detail page
    ↓
[Create work order] [Review recording]
```

## Anomaly Detection

The system should flag unusual patterns:

**Detected Anomalies:**
- Sudden increase in camera failures
- Frequent outages in specific branch
- Unusual recording access patterns
- Repeated storage failures
- High false alarm rate
- Abnormal export volume
- Increasing disk errors
- Repeated maintenance on same camera
- Incident concentration in specific hours

**Anomaly Handling:**
- Log to `metric_anomalies` table
- Generate observation (not conclusion)
- Allow investigation workflow
- Track false positives
- Adjust detection baselines

## Dashboard Performance Optimization

For large deployments (1000+ cameras):

1. **Pre-aggregate metrics** in daily summary tables
2. **Cache dashboard summaries** (15-30 second TTL)
3. **Update critical cards** via event stream
4. **Paginate detailed lists**
5. **Use async report generation** for large exports
6. **Separate operational queries** from historical analysis
7. **Apply tenant scope** before aggregation
8. **Use time-series database** for health metrics

**Refresh Intervals:**
- Critical alerts: Real-time
- Camera online/offline: 15-30 seconds
- Recording status: 1-5 minutes
- Storage capacity: 1-5 minutes
- Incidents: Real-time
- Maintenance: 5-15 minutes
- Executive trends: Hourly/daily

## Export Controls

Every export is logged with:
- User, role, purpose
- Report type, filters, date range
- Output format, row count
- Approval (if required)
- Recipient (if external)
- Timestamp, device, IP
- Watermark ID
- Download status

**Sensitive Export Requirements:**
- Step-up authentication
- Manager approval
- Business justification
- Data masking options
- Time-limited download links
- Revocation capability

## Permissions

### Dashboard Permissions
```
dashboard:view
dashboard:configure
dashboard:share
```

### Report Permissions
```
report:view
report:create
report:schedule
report:export
report:share
report:delete
```

### Report-Specific Permissions
```
camera-health-report:view
recording-report:view
storage-report:view
incident-report:view
access-report:view
maintenance-report:view
downtime-report:view
alert-report:view
executive-dashboard:view
compliance-dashboard:view
security-dashboard:view
```

### Scope Controls
- Tenant-level isolation
- Organization hierarchy enforcement
- Regional restrictions
- Branch-specific access
- Camera-level permissions
- Report type restrictions

## Implementation Checklist

### Phase 1: Foundation
- [x] Database schema creation
- [x] Core service layer (dashboard, reports)
- [x] API routes implementation
- [x] Basic dashboard UI
- [x] Role-based access control

### Phase 2: Core Reports
- [ ] Camera health report with filters
- [ ] Recording status report
- [ ] Storage utilization report
- [ ] Incident register
- [ ] Maintenance log

### Phase 3: Advanced Features
- [ ] System health scoring
- [ ] Report scheduling engine
- [ ] Export generation (PDF, XLSX, CSV)
- [ ] Email delivery
- [ ] Anomaly detection

### Phase 4: Enterprise Features
- [ ] Custom report builder
- [ ] Drill-down navigation
- [ ] Trend analytics
- [ ] Forecasting
- [ ] Executive dashboards

### Phase 5: Compliance & Audit
- [ ] Footage retrieval log
- [ ] Downtime report
- [ ] Alert summary report
- [ ] Export audit trail
- [ ] Compliance certificates

## Testing Strategy

### Unit Tests
- Service methods (dashboard metrics, report generation)
- Health score calculation
- Data aggregation functions
- Filter application

### Integration Tests
- API endpoints
- Database queries
- Report exports
- Email delivery

### Performance Tests
- Dashboard load time (< 2 seconds)
- Large report generation (1000+ rows)
- Concurrent user access
- Real-time data refresh

### Security Tests
- Scope enforcement
- Export audit logging
- Sensitive data masking
- Permission validation

## Monitoring

### Key Metrics
- Dashboard load time
- Report generation time
- Failed report runs
- Export download rate
- Data freshness lag
- Anomaly detection accuracy

### Alerts
- Dashboard unavailable
- Report generation failures
- Data staleness exceeded threshold
- Export approval backlog
- Storage forecast critical

## Next Steps

1. **Complete database migration** - Run schema creation
2. **Deploy backend services** - Dashboard and reports services
3. **Configure API routes** - Register dashboard and report endpoints
4. **Implement frontend** - Complete dashboard UI components
5. **Add report scheduling** - Cron-based report generation
6. **Enable exports** - PDF/XLSX/CSV generation
7. **Set up email delivery** - Scheduled report distribution
8. **Configure thresholds** - Health scoring and alert thresholds
9. **Enable anomaly detection** - Pattern recognition
10. **User training** - Role-based dashboard usage

## Support

For questions or issues:
- Technical documentation: `/docs/reports-dashboard`
- API reference: `/api/docs`
- User guides: `/help/dashboards` and `/help/reports`

---

**Implementation Status:** ✅ Core database schema and services complete
**Next Priority:** Report scheduling and export generation
**Target Completion:** Phase 1-2 production ready
