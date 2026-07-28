# Enterprise Surveillance Platform - Gap Analysis & Implementation Plan

## Executive Summary

**Current State**: Project has strong AI analytics engine foundation with 14 modules, but gaps in centralized multi-branch monitoring dashboard, device health tracking at scale, and enterprise alert management system.

**Target State**: Centralized surveillance platform monitoring 400+ branches with comprehensive health dashboards, real-time AI alerts with multi-channel notifications (P1-P4 priority system), and automated reporting.

**Gap Analysis Date**: July 28, 2026  
**Project**: Omsystems Surveillance Monitoring Platform

---

## Requirements Analysis

### Core Requirements Summary
1. **Scale**: 400 branches (scalable to unlimited)
2. **Centralized Dashboard**: Maximum channels/branches in single view
3. **Branch Monitoring**: Individual branch view with all cameras
4. **Device Health**: DVR/NVR, camera, HDD, internet connectivity status
5. **Recording Retention**: Automated tracking with red flag alerts
6. **AI Analytics**: Real-time alerts with severity classification
7. **Alert System**: Multi-channel notifications (Dashboard/SMS/Email/Phone)
8. **Reporting**: Daily exports and summary reports

---

## Current System Capabilities

### ✅ Strengths (Already Implemented)

#### 1. AI Analytics Engine (14 Modules)
- **Human Analytics**: Person tracking, Re-ID, 9 behaviors
- **Vehicle Analytics**: ANPR, speed detection, 15 vehicle types
- **Face Analytics**: Recognition, watchlist, demographics
- **Safety Analytics**: PPE detection (14 classes), fire/smoke
- **Banking Analytics**: Teller/vault/ATM monitoring
- **Enhanced Security**: Intrusion detection, camera health (12 metrics)
- **AI Search**: Natural language video search
- **Investigation Tools**: Cross-camera tracking, forensics
- **Retail Analytics**: Customer flow, queues, conversion
- **Prediction Engine**: Hardware failure forecasting
- **Reporting Engine**: Automated reports, dashboards
- **AI Assistant**: Conversational interface

#### 2. Database Infrastructure
- Camera health history tracking
- Quality alerts system
- Recovery logging
- Materialized views for performance
- Camera uptime calculation functions
- Quality scoring algorithms

#### 3. Detection Capabilities
- 50+ object classes detection
- 20+ behavior types
- Real-time tracking across frames
- Zone-based analytics
- Heat map generation

---

## Gap Analysis by Requirement Area

### 🔴 GAP 1: Centralized Multi-Branch Dashboard

**Requirement**: View maximum channels/branches in single screen
**Current State**: ❌ Not implemented

**Gap Severity**: CRITICAL  
**Impact**: Cannot monitor multiple branches from single view

**Missing Components**:
1. Multi-branch grid layout system (e.g., 4x4, 5x5, 6x6 grids)
2. Branch status aggregation API
3. Real-time branch health summary widgets
4. Scalable WebSocket/SSE for 400+ branch updates
5. Grid view with branch thumbnails/status indicators
6. Branch filtering and search capabilities
7. Customizable dashboard layouts per user role

**Technical Requirements**:
- Frontend: React dashboard with grid layout (react-grid-layout)
- Backend: Branch aggregation API endpoints
- Real-time: WebSocket server for live status updates
- Database: Branch summary materialized views
- Performance: Handle 400+ simultaneous branch status updates

---

### 🔴 GAP 2: DVR/NVR Health Monitoring

**Requirement**: Real-time DVR/NVR online/offline status per branch
**Current State**: ⚠️ Partially implemented (database schema exists)
**Gap Severity**: HIGH
**Impact**: Cannot track DVR/NVR operational status

**Missing Components**:
1. DVR/NVR health monitoring service (ping/API health checks)
2. Device registration and discovery system
3. Health check scheduler (every 30-60 seconds)
4. Status transition tracking (online → offline detection)
5. API endpoints for DVR/NVR health retrieval
6. Dashboard widgets for device status visualization
7. Alert generation on device failures

**Technical Requirements**:
- Service: Node.js/TypeScript health monitoring daemon
- Protocol: ONVIF, RTSP health checks, manufacturer APIs
- Database: dvr_nvr_health_history table integration
- Scheduler: Cron-based or event-driven health checks
- API: REST endpoints for device status queries

---

### 🔴 GAP 3: HDD Health & Status Monitoring

**Requirement**: HDD health/status tracking across all branches
**Current State**: ❌ Not implemented
**Gap Severity**: HIGH
**Impact**: Cannot predict storage failures or capacity issues

**Missing Components**:
1. HDD S.M.A.R.T. data collection via DVR/NVR APIs
2. Storage capacity monitoring (used/total)
3. HDD health scoring algorithm (temperature, bad sectors, etc.)
4. Predictive failure analysis using existing AI prediction engine
5. Storage exhaustion forecasting
6. Dashboard visualization for storage health
7. Alert generation for HDD warnings

**Technical Requirements**:
- Integration: DVR/NVR SDK/API for SMART data
- Database: hdd_health_metrics table (new)
- Analysis: Machine learning for failure prediction
- Metrics: Temperature, power-on hours, reallocated sectors
- Alerts: Pre-failure warnings (7-14 days advance notice)

---

### 🔴 GAP 4: Recording Retention Monitoring

**Requirement**: Track recording retention days with auto-highlight below threshold (red)
**Current State**: ❌ Not implemented
**Gap Severity**: HIGH
**Impact**: Compliance risk, cannot ensure retention policy adherence

**Missing Components**:
1. Recording timeline analysis per camera
2. Retention period calculation (oldest → newest recording)
3. Configurable retention policy thresholds per branch/camera
4. Automatic red flag alerts when below threshold
5. Recording gap detection (missing recordings)
6. Dashboard visualization with color-coded status
7. Retention compliance reporting

**Technical Requirements**:
- Service: Recording metadata analyzer
- Database: recording_retention_status table (new)
- Calculation: Daily scan of recording files/database
- Policy: Configurable thresholds (e.g., 30/60/90 days)
- Visualization: Color-coded indicators (green/yellow/red)
- Alerts: Automated notifications for violations

---

### 🟡 GAP 5: Internet Connectivity Monitoring

**Requirement**: Local internet connectivity status per branch
**Current State**: ⚠️ Partially possible (can infer from device status)
**Gap Severity**: MEDIUM
**Impact**: Cannot distinguish network vs device failures

**Missing Components**:
1. Network monitoring agent at each branch (gateway pings)
2. Bandwidth utilization tracking
3. Latency and packet loss monitoring
4. ISP failover detection
5. Network topology mapping
6. Dashboard network health widgets
7. Network-related alert generation

**Technical Requirements**:
- Agent: Lightweight network monitoring service at branches
- Metrics: Ping latency, bandwidth, jitter, packet loss
- Protocol: ICMP, SNMP for router/gateway monitoring
- Database: network_health_history table (new)
- Visualization: Network status indicators per branch

---

### 🔴 GAP 6: AI Alert Dashboard with Popup System

**Requirement**: Real-time alert dashboard with popup + sound + live video
**Current State**: ⚠️ Partial (detection events exist, UI/notification missing)
**Gap Severity**: CRITICAL
**Impact**: Cannot effectively respond to AI-detected incidents

**Missing Components**:
1. Real-time alert dashboard UI (React/Vue)
2. Alert popup modal with embedded video player
3. Audio notification system (browser Web Audio API)
4. Live video streaming integration (WebRTC/HLS)
5. Acknowledge/Escalate action workflows
6. Alert queue management system
7. Priority-based alert routing
8. Snapshot and video clip capture/storage

**Alert Information Display**:
- Branch Name
- Alert Type (intrusion, fire, PPE violation, etc.)
- Severity Level (P1/P2/P3/P4)
- Live Video Feed
- Snapshot Image
- Video Clip (10-30 seconds)
- Timestamp and Location
- Action Buttons: Acknowledge, Escalate, Dismiss, View Details

**Technical Requirements**:
- Frontend: Modal component library (React Modal, MUI Dialog)
- Audio: Web Audio API for alert sounds
- Video: WebRTC for low-latency live streaming
- Storage: S3/MinIO for snapshots and clips
- API: Real-time alert subscription via WebSocket

---

### 🔴 GAP 7: Multi-Channel Notification System (P1-P4)

**Requirement**: Priority-based notifications across multiple channels
**Current State**: ⚠️ Partial (notification engine exists, channels not fully implemented)
**Gap Severity**: CRITICAL
**Impact**: Cannot ensure timely response to critical incidents

**Priority Matrix**:
| Priority | Channels | Use Cases |
|----------|----------|-----------|
| P1 (Critical) | Dashboard + SMS + Email + Phone Call | Fire, intrusion, person down, major equipment failure |
| P2 (High) | Dashboard + Email | Unauthorized access, PPE violations, camera offline |
| P3 (Medium) | Dashboard Only | Queue buildup, loitering, minor quality issues |
| P4 (Low) | System Log Only | Informational events, routine status updates |

**Missing Components**:
1. SMS gateway integration (Twilio, AWS SNS)
2. Voice call system (Twilio Voice API)
3. Email service with templates
4. Priority-based routing logic
5. Notification delivery tracking
6. Escalation workflows (if not acknowledged in X minutes)
7. On-call rotation management
8. Rate limiting and de-duplication
9. Notification preferences per user/role

**Technical Requirements**:
- SMS: Twilio API, AWS SNS, or similar
- Voice: Twilio Voice with IVR menus
- Email: SendGrid, AWS SES, or SMTP
- Database: notification_log, escalation_policies tables
- Queue: Redis/Bull for notification job processing
- Delivery: Retry logic with exponential backoff

---

### 🟡 GAP 8: Daily Reports & Export Functionality

**Requirement**: Daily device health reports and segregated alert reports
**Current State**: ⚠️ Partial (reporting engine exists, specific reports need development)
**Gap Severity**: MEDIUM
**Impact**: Manual effort required for compliance reporting

**Missing Components**:
1. Scheduled daily report generation
2. Device health check report templates
3. Alert summary report by branch/type/severity
4. Export formats: PDF, Excel, CSV
5. Email delivery of automated reports
6. Report scheduling and customization
7. Historical report archive

**Report Types Needed**:
- **Daily Branch Health Summary**: All branches, device status, uptime
- **Camera Status Report**: Per-camera health, quality metrics
- **HDD Health Report**: Storage capacity, SMART status
- **Recording Retention Report**: Compliance status per camera
- **AI Alert Summary**: Counts by type, severity, branch
- **Response Time Report**: Alert acknowledgment metrics
- **Network Status Report**: Connectivity issues, bandwidth

**Technical Requirements**:
- Library: PDFKit (Node.js) or Puppeteer for PDF generation
- Excel: ExcelJS for XLSX export
- Scheduler: Node-cron for daily report generation
- Storage: S3/MinIO for report archive
- Email: Automated delivery with attachments

---

## Detailed Implementation Plan

### Phase 1: Foundation & Infrastructure (Weeks 1-2)

**Goal**: Establish database schemas, core services, and monitoring infrastructure

#### Tasks:

**1.1 Database Schema Enhancements**
- [ ] Create `branch_summary` materialized view
- [ ] Create `dvr_nvr_devices` table
- [ ] Create `dvr_nvr_health_history` table
- [ ] Create `hdd_health_metrics` table
- [ ] Create `recording_retention_status` table
- [ ] Create `network_health_history` table
- [ ] Create `notification_log` table
- [ ] Create `escalation_policies` table
- [ ] Create indexes for performance optimization
- [ ] Migration scripts for existing data

**1.2 Core Monitoring Services**
- [ ] DVR/NVR health monitoring service
  - ONVIF device discovery
  - Periodic health checks (30s interval)
  - Status change detection and logging
- [ ] HDD health monitoring service
  - SMART data collection via vendor APIs
  - Storage capacity tracking
  - Failure prediction integration
- [ ] Recording retention analyzer
  - Daily scan of recording metadata
  - Retention period calculation
  - Policy compliance checking
- [ ] Network connectivity monitor
  - Branch gateway ping monitoring
  - Bandwidth utilization tracking
  - ISP failover detection

**1.3 Real-Time Infrastructure**
- [ ] WebSocket server setup for live updates
- [ ] Redis pub/sub for event distribution
- [ ] Message queue (Bull/BullMQ) for job processing
- [ ] Rate limiting and throttling mechanisms

**Deliverables**:
- Database migrations applied
- 4 monitoring services running
- Real-time event infrastructure operational

---

### Phase 2: Centralized Dashboard Development (Weeks 3-4)

**Goal**: Build multi-branch centralized monitoring dashboard

#### Tasks:

**2.1 Backend API Development**
- [ ] Branch aggregation API endpoints
  ```typescript
  GET /api/v1/branches/summary
  GET /api/v1/branches/:id/health
  GET /api/v1/branches/:id/cameras
  GET /api/v1/dashboard/overview
  ```
- [ ] Real-time status update endpoints (WebSocket)
- [ ] Branch filtering and search API
- [ ] Performance optimization (caching, materialized views)

**2.2 Frontend Dashboard Components**
- [ ] Main dashboard layout (React/Next.js)
- [ ] Multi-branch grid view component (react-grid-layout)
  - Configurable layouts (4x4, 5x5, 6x6, 8x8)
  - Branch status cards with indicators
  - Click-to-expand individual branch view
- [ ] Branch detail panel
  - All cameras grid view
  - Device health indicators (DVR/NVR/HDD)
  - Recording retention status
  - Network connectivity status
- [ ] Status indicator components
  - Color-coded health status (green/yellow/red)
  - Animated pulse for critical issues
  - Tooltip with detailed information
- [ ] Search and filter controls
- [ ] Dashboard customization settings

**2.3 Real-Time Updates**
- [ ] WebSocket client integration
- [ ] Live status update handling
- [ ] Optimistic UI updates
- [ ] Connection loss handling and reconnection

**Deliverables**:
- Centralized dashboard with 400+ branch support
- Individual branch detail views
- Real-time status updates operational
- Responsive UI for large-scale monitoring

---

### Phase 3: Alert System & Notifications (Weeks 5-6)

**Goal**: Implement multi-tier alert system with popup and notifications

#### Tasks:

**3.1 Alert Management System**
- [ ] Alert queue processing service
- [ ] Priority-based routing engine
- [ ] Alert de-duplication logic
- [ ] Escalation workflow engine
- [ ] Alert lifecycle management (new → acknowledged → resolved)

**3.2 Notification Channels Implementation**
- [ ] SMS gateway integration (Twilio)
  ```typescript
  // Example configuration
  const smsConfig = {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    from: process.env.TWILIO_PHONE_NUMBER
  };
  ```
- [ ] Voice call system (Twilio Voice)
  - IVR menu for alert details
  - Acknowledge via phone keypad
  - Call status tracking
- [ ] Email service with HTML templates
  - Branded email templates
  - Embedded snapshots
  - Action buttons (acknowledge, escalate)
- [ ] Dashboard notification system
  - Browser notifications (Web Notifications API)
  - In-app notification center
- [ ] Notification delivery tracking
- [ ] Retry logic with exponential backoff

**3.3 Alert Dashboard UI**
- [ ] Real-time alert feed component
- [ ] Alert popup modal with:
  - Branch name and location
  - Alert type and severity badge
  - Live video player (WebRTC/HLS)
  - Snapshot image gallery
  - Video clip player (10-30s)
  - Timestamp and metadata
  - Action buttons (Acknowledge, Escalate, Dismiss)
- [ ] Audio alert system
  - Different sounds for P1/P2/P3
  - Volume control
  - Mute/unmute functionality
- [ ] Alert history and search
- [ ] Alert analytics dashboard

**3.4 Video Integration**
- [ ] Snapshot capture service (from camera stream)
- [ ] Video clip generation service (pre/post event)
- [ ] Storage service (S3/MinIO) for media files
- [ ] WebRTC server for low-latency live streaming
- [ ] HLS fallback for compatibility

**Deliverables**:
- Multi-channel notification system operational
- Alert popup with live video and snapshots
- P1-P4 priority routing functional
- SMS, email, and voice call integration complete

---

### Phase 4: Device Health & Retention Monitoring (Weeks 7-8)

**Goal**: Complete device health tracking and retention monitoring

#### Tasks:

**4.1 DVR/NVR Monitoring Integration**
- [ ] Vendor API integrations (CP Plus, Hikvision, Dahua)
- [ ] ONVIF generic integration
- [ ] Device health check scheduler
- [ ] API endpoints for device management
  ```typescript
  GET /api/v1/devices/dvr-nvr
  GET /api/v1/devices/:id/health
  POST /api/v1/devices/:id/reboot
  ```

**4.2 HDD Health Monitoring**
- [ ] SMART data collection via vendor APIs
- [ ] Storage metrics calculation
  - Used/Total capacity
  - Projected exhaustion date
  - Bad sector count
  - Temperature monitoring
- [ ] HDD health scoring algorithm
- [ ] Predictive failure analysis (integrate with AI prediction engine)
- [ ] Dashboard widgets for HDD status

**4.3 Recording Retention Monitoring**
- [ ] Recording timeline analysis service
- [ ] Retention period calculator
- [ ] Policy configuration UI
  - Set retention thresholds per branch/camera
  - Compliance rules definition
- [ ] Automatic red flag generation
- [ ] Gap detection (missing recordings)
- [ ] Dashboard visualization with color coding
- [ ] Compliance reports

**4.4 Network Monitoring**
- [ ] Branch network agent deployment
- [ ] Gateway monitoring (ping, traceroute)
- [ ] Bandwidth utilization tracking
- [ ] Latency and jitter measurement
- [ ] Dashboard network health widgets

**Deliverables**:
- Complete device health monitoring
- HDD predictive failure alerts
- Recording retention compliance tracking
- Network health visibility

---

### Phase 5: Reporting & Analytics (Weeks 9-10)

**Goal**: Automated reporting and export functionality

#### Tasks:

**5.1 Report Generation Engine**
- [ ] Report template system
- [ ] PDF generation (Puppeteer/PDFKit)
- [ ] Excel generation (ExcelJS)
- [ ] CSV export functionality
- [ ] Report scheduler (node-cron)
- [ ] Report archive storage

**5.2 Report Types Implementation**
- [ ] Daily Branch Health Summary
  - All branches overview
  - Device online/offline counts
  - Uptime percentages
  - Critical issues summary
- [ ] Camera Status Report
  - Per-camera health metrics
  - Quality scores
  - Recording status
- [ ] HDD Health Report
  - Storage capacity by branch
  - SMART status warnings
  - Projected failures
- [ ] Recording Retention Report
  - Compliance status per camera
  - Retention policy violations
  - Gap analysis
- [ ] AI Alert Summary Report
  - Alert counts by type/severity/branch
  - Response time metrics
  - Top incident locations
- [ ] Network Status Report
  - Connectivity issues summary
  - Bandwidth utilization
  - Network outage timeline
- [ ] Executive Summary Dashboard
  - KPIs and metrics
  - Trend analysis
  - Cost/risk assessment

**5.3 Report Distribution**
- [ ] Automated email delivery
- [ ] Report download portal
- [ ] Report scheduling UI
- [ ] Custom report builder
- [ ] Historical report access

**Deliverables**:
- 7 automated report types operational
- Scheduled daily report generation
- Multi-format export (PDF, Excel, CSV)
- Email delivery system functional

---

### Phase 6: Testing, Optimization & Deployment (Weeks 11-12)

**Goal**: System testing, performance optimization, and production deployment

#### Tasks:

**6.1 Testing**
- [ ] Load testing (400+ branches, 4000+ cameras)
- [ ] Alert system stress testing
- [ ] Real-time update performance testing
- [ ] Notification delivery testing
- [ ] End-to-end workflow testing
- [ ] Failover and disaster recovery testing
- [ ] Security penetration testing
- [ ] User acceptance testing (UAT)

**6.2 Performance Optimization**
- [ ] Database query optimization
- [ ] Materialized view refresh strategy
- [ ] Caching layer implementation (Redis)
- [ ] WebSocket connection pooling
- [ ] CDN for static assets
- [ ] Load balancing configuration
- [ ] Database connection pooling
- [ ] API response time optimization

**6.3 Monitoring & Observability**
- [ ] Prometheus metrics integration
- [ ] Grafana dashboards
- [ ] Log aggregation (ELK stack or similar)
- [ ] Application performance monitoring (APM)
- [ ] Uptime monitoring (Pingdom, UptimeRobot)
- [ ] Error tracking (Sentry)

**6.4 Documentation**
- [ ] System architecture documentation
- [ ] API documentation (Swagger/OpenAPI)
- [ ] User manuals
- [ ] Administrator guides
- [ ] Troubleshooting guides
- [ ] Deployment runbooks

**6.5 Production Deployment**
- [ ] Infrastructure provisioning
- [ ] Database migration execution
- [ ] Service deployment (Docker/Kubernetes)
- [ ] Configuration management
- [ ] SSL/TLS certificate setup
- [ ] Backup and recovery procedures
- [ ] Monitoring setup
- [ ] Security hardening

**Deliverables**:
- Production-ready system
- Comprehensive documentation
- Monitoring and alerting configured
- UAT approval obtained

---

## Technical Architecture Additions

### New Services to Develop

```
surveillance-platform/
├── backend/
│   ├── device-monitor/              # NEW: DVR/NVR/HDD monitoring
│   │   ├── dvr-nvr-monitor.ts
│   │   ├── hdd-health-monitor.ts
│   │   ├── network-monitor.ts
│   │   └── retention-analyzer.ts
│   ├── notification-service/        # NEW: Multi-channel notifications
│   │   ├── sms-provider.ts
│   │   ├── voice-provider.ts
│   │   ├── email-provider.ts
│   │   ├── notification-router.ts
│   │   └── escalation-manager.ts
│   ├── alert-manager/              # NEW: Alert lifecycle management
│   │   ├── alert-queue.ts
│   │   ├── alert-deduplicator.ts
│   │   ├── priority-router.ts
│   │   └── alert-api.ts
│   ├── report-engine/              # ENHANCE: Additional report types
│   │   ├── health-report.ts
│   │   ├── retention-report.ts
│   │   ├── alert-summary-report.ts
│   │   └── scheduler.ts
│   ├── realtime-service/           # NEW: WebSocket server
│   │   ├── websocket-server.ts
│   │   ├── event-broadcaster.ts
│   │   └── connection-manager.ts
│   └── video-service/              # NEW: Video capture & streaming
│       ├── snapshot-service.ts
│       ├── clip-generator.ts
│       ├── webrtc-server.ts
│       └── storage-service.ts
├── frontend/
│   ├── dashboard/                  # NEW: Centralized dashboard
│   │   ├── BranchGridView.tsx
│   │   ├── BranchDetailPanel.tsx
│   │   ├── StatusIndicator.tsx
│   │   └── DashboardLayout.tsx
│   ├── alerts/                     # NEW: Alert UI
│   │   ├── AlertPopup.tsx
│   │   ├── AlertFeed.tsx
│   │   ├── AlertHistory.tsx
│   │   └── AudioAlert.tsx
│   ├── device-health/              # NEW: Device monitoring UI
│   │   ├── DVRStatus.tsx
│   │   ├── HDDHealth.tsx
│   │   ├── NetworkStatus.tsx
│   │   └── RetentionStatus.tsx
│   ├── reports/                    # NEW: Report viewer
│   │   ├── ReportViewer.tsx
│   │   ├── ReportScheduler.tsx
│   │   └── ReportDownload.tsx
│   └── live-video/                 # NEW: Live streaming
│       ├── VideoPlayer.tsx
│       ├── VideoGrid.tsx
│       └── StreamManager.tsx
└── database/
    ├── migrations/
    │   ├── add_branch_summary_view.sql
    │   ├── add_dvr_nvr_tables.sql
    │   ├── add_hdd_health_tables.sql
    │   ├── add_retention_tables.sql
    │   ├── add_notification_tables.sql
    │   └── add_network_tables.sql
    └── seeds/
        └── sample_branches_data.sql
```

---

## Database Schema Additions

### New Tables Required

```sql
-- DVR/NVR Devices
CREATE TABLE dvr_nvr_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID NOT NULL REFERENCES resource_nodes(id),
  name VARCHAR(200) NOT NULL,
  device_type VARCHAR(20) CHECK (device_type IN ('DVR', 'NVR', 'Hybrid')),
  vendor VARCHAR(100),
  model VARCHAR(100),
  ip_address INET,
  mac_address MACADDR,
  total_channels INTEGER,
  api_url TEXT,
  credentials_encrypted BYTEA,
  status VARCHAR(20) DEFAULT 'unknown',
  last_seen_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- HDD Health Metrics
CREATE TABLE hdd_health_metrics (
  id BIGSERIAL PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES dvr_nvr_devices(id),
  hdd_index INTEGER NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Capacity metrics
  total_capacity_gb BIGINT,
  used_capacity_gb BIGINT,
  free_capacity_gb BIGINT,
  usage_percentage DECIMAL(5,2),
  
  -- SMART metrics
  temperature_celsius INTEGER,
  power_on_hours BIGINT,
  reallocated_sectors INTEGER,
  pending_sectors INTEGER,
  uncorrectable_errors INTEGER,
  health_status VARCHAR(20), -- 'good', 'warning', 'critical'
  predicted_failure_date TIMESTAMP WITH TIME ZONE,
  
  metadata JSONB
);

-- Recording Retention Status
CREATE TABLE recording_retention_status (
  id BIGSERIAL PRIMARY KEY,
  camera_id UUID NOT NULL REFERENCES cameras(id),
  branch_id UUID NOT NULL REFERENCES resource_nodes(id),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  oldest_recording_date TIMESTAMP WITH TIME ZONE,
  newest_recording_date TIMESTAMP WITH TIME ZONE,
  retention_days INTEGER,
  required_retention_days INTEGER,
  compliance_status VARCHAR(20), -- 'compliant', 'warning', 'violation'
  
  -- Gap detection
  has_gaps BOOLEAN DEFAULT false,
  gap_count INTEGER DEFAULT 0,
  total_gap_hours INTEGER,
  
  metadata JSONB
);

-- Network Health History
CREATE TABLE network_health_history (
  id BIGSERIAL PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES resource_nodes(id),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  gateway_reachable BOOLEAN,
  ping_latency_ms DECIMAL(10,2),
  packet_loss_percentage DECIMAL(5,2),
  jitter_ms DECIMAL(10,2),
  
  bandwidth_up_mbps DECIMAL(10,2),
  bandwidth_down_mbps DECIMAL(10,2),
  
  isp_status VARCHAR(20),
  
  metadata JSONB
);

-- Notification Log
CREATE TABLE notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES camera_quality_alerts(id),
  
  notification_type VARCHAR(20), -- 'sms', 'email', 'voice', 'dashboard', 'webhook'
  recipient VARCHAR(200),
  
  status VARCHAR(20), -- 'pending', 'sent', 'delivered', 'failed'
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  metadata JSONB
);

-- Escalation Policies
CREATE TABLE escalation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(200) NOT NULL,
  
  alert_type VARCHAR(50),
  severity VARCHAR(20),
  
  -- Escalation levels
  levels JSONB NOT NULL, -- [{level: 1, delay_minutes: 0, recipients: []}, ...]
  
  enabled BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Branch Summary Materialized View
CREATE MATERIALIZED VIEW branch_summary AS
SELECT 
  rn.id as branch_id,
  rn.name as branch_name,
  rn.tenant_id,
  
  -- Camera counts
  COUNT(DISTINCT c.id) as total_cameras,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'online') as online_cameras,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'offline') as offline_cameras,
  
  -- DVR/NVR status
  COUNT(DISTINCT d.id) as total_devices,
  COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'online') as online_devices,
  
  -- Active alerts
  COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'active') as active_alerts,
  COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'active' AND a.severity = 'critical') as critical_alerts,
  
  -- Recording retention
  AVG(rr.retention_days) as avg_retention_days,
  COUNT(DISTINCT rr.camera_id) FILTER (WHERE rr.compliance_status = 'violation') as retention_violations,
  
  -- Network health
  MAX(nh.timestamp) as last_network_check,
  (SELECT gateway_reachable FROM network_health_history 
   WHERE branch_id = rn.id ORDER BY timestamp DESC LIMIT 1) as network_online,
  
  NOW() as last_updated
  
FROM resource_nodes rn
LEFT JOIN cameras c ON c.branch_node_id = rn.id
LEFT JOIN dvr_nvr_devices d ON d.branch_id = rn.id
LEFT JOIN camera_quality_alerts a ON a.branch_id = rn.id
LEFT JOIN recording_retention_status rr ON rr.branch_id = rn.id
LEFT JOIN network_health_history nh ON nh.branch_id = rn.id
WHERE rn.type = 'branch'
GROUP BY rn.id, rn.name, rn.tenant_id;

CREATE UNIQUE INDEX idx_branch_summary_branch ON branch_summary(branch_id);
```

---

## API Endpoints to Develop

### Dashboard APIs

```typescript
// Branch Overview
GET /api/v1/dashboard/overview
Response: {
  totalBranches: 400,
  onlineBranches: 385,
  offlineBranches: 15,
  totalCameras: 4000,
  onlineCameras: 3850,
  activeAlerts: 45,
  criticalAlerts: 5
}

// Branch Grid Data
GET /api/v1/branches/grid?page=1&limit=64
Response: {
  branches: [
    {
      id: "uuid",
      name: "Branch 001",
      status: "online|offline|warning",
      cameras: { total: 10, online: 9, offline: 1 },
      devices: { total: 2, online: 2 },
      alerts: { active: 2, critical: 0 },
      network: { status: "online", latency: 45 },
      retention: { compliant: true, minDays: 45 }
    }
  ],
  pagination: { page: 1, limit: 64, total: 400 }
}

// Branch Detail
GET /api/v1/branches/:id/detail
Response: {
  branch: { /* branch info */ },
  cameras: [ /* all cameras with status */ ],
  devices: [ /* DVR/NVR devices */ ],
  alerts: [ /* active alerts */ ],
  health: {
    networkStatus: { /* network metrics */ },
    retentionStatus: { /* retention compliance */ },
    hddHealth: [ /* HDD status for each device */ ]
  }
}
```

### Device Health APIs

```typescript
// DVR/NVR Status
GET /api/v1/devices/dvr-nvr?branchId=uuid
POST /api/v1/devices/dvr-nvr/:id/reboot
GET /api/v1/devices/dvr-nvr/:id/health-history

// HDD Health
GET /api/v1/devices/:deviceId/hdd-health
Response: {
  devices: [
    {
      deviceId: "uuid",
      hddIndex: 0,
      totalCapacityGB: 8000,
      usedCapacityGB: 6200,
      usagePercentage: 77.5,
      healthStatus: "good|warning|critical",
      temperature: 42,
      predictedFailureDate: "2027-01-15T00:00:00Z"
    }
  ]
}

// Recording Retention
GET /api/v1/recording/retention?branchId=uuid
Response: {
  cameras: [
    {
      cameraId: "uuid",
      cameraName: "Camera 01",
      retentionDays: 45,
      requiredDays: 60,
      complianceStatus: "violation|warning|compliant",
      oldestRecording: "2026-06-13T00:00:00Z",
      hasGaps: true,
      gapCount: 3
    }
  ]
}

// Network Health
GET /api/v1/network/health?branchId=uuid
```

### Alert APIs

```typescript
// Alert Feed (WebSocket)
WS /api/v1/alerts/stream
Message: {
  type: "new_alert",
  alert: {
    id: "uuid",
    branchId: "uuid",
    branchName: "Branch 001",
    alertType: "intrusion",
    severity: "P1",
    timestamp: "2026-07-28T10:30:00Z",
    cameraId: "uuid",
    snapshotUrl: "https://...",
    videoClipUrl: "https://...",
    liveStreamUrl: "webrtc://..."
  }
}

// Alert Actions
POST /api/v1/alerts/:id/acknowledge
POST /api/v1/alerts/:id/escalate
POST /api/v1/alerts/:id/dismiss
GET /api/v1/alerts/history?severity=P1&startDate=...&endDate=...
```

### Report APIs

```typescript
// Generate Report
POST /api/v1/reports/generate
Body: {
  reportType: "branch_health|camera_status|hdd_health|retention|alerts",
  format: "pdf|xlsx|csv",
  filters: {
    branchIds: ["uuid"],
    dateRange: { start: "...", end: "..." }
  }
}
Response: {
  reportId: "uuid",
  status: "generating",
  estimatedTime: 30
}

// Download Report
GET /api/v1/reports/:id/download

// Schedule Report
POST /api/v1/reports/schedule
Body: {
  reportType: "...",
  schedule: "daily|weekly|monthly",
  time: "08:00",
  recipients: ["email@example.com"],
  format: "pdf"
}
```

---

## Technology Stack Recommendations

### Backend Services
- **Language**: Node.js / TypeScript
- **Framework**: Express.js or Fastify
- **Real-time**: Socket.io or native WebSocket
- **Queue**: Bull/BullMQ with Redis
- **Caching**: Redis
- **ORM**: Prisma (already in use)
- **Database**: PostgreSQL (already in use)

### Notification Services
- **SMS**: Twilio, AWS SNS, or Vonage
- **Voice**: Twilio Voice API
- **Email**: SendGrid, AWS SES, or Mailgun
- **Push**: Firebase Cloud Messaging (FCM)

### Frontend
- **Framework**: React or Next.js
- **UI Library**: Material-UI, Ant Design, or Chakra UI
- **Grid Layout**: react-grid-layout
- **Video**: Video.js, HLS.js, or Shaka Player
- **WebRTC**: simple-peer or PeerJS
- **State Management**: Redux Toolkit or Zustand
- **Real-time**: Socket.io-client

### Video & Storage
- **Live Streaming**: WebRTC (WHIP/WHEP) or HLS
- **Video Processing**: FFmpeg
- **Storage**: MinIO (S3-compatible) or AWS S3
- **CDN**: CloudFlare or AWS CloudFront

### Monitoring & Observability
- **Metrics**: Prometheus + Grafana
- **Logs**: ELK Stack (Elasticsearch, Logstash, Kibana) or Loki
- **APM**: New Relic, Datadog, or Elastic APM
- **Error Tracking**: Sentry
- **Uptime**: Pingdom or UptimeRobot

### DevOps & Infrastructure
- **Container**: Docker
- **Orchestration**: Kubernetes or Docker Swarm
- **CI/CD**: GitHub Actions or GitLab CI
- **IaC**: Terraform or Pulumi
- **Load Balancer**: Nginx or HAProxy

---

## Scalability Considerations

### For 400+ Branches (4000+ Cameras)

#### Database Optimization
- Partitioning: Monthly partitions for health history tables
- Materialized Views: Refresh every 1-5 minutes
- Read Replicas: Separate read/write workloads
- Connection Pooling: PgBouncer for connection management
- Indexes: Comprehensive indexing strategy

#### Real-Time Updates
- WebSocket Sharding: Multiple WebSocket servers with sticky sessions
- Redis Pub/Sub: Event distribution across servers
- Message Queue: Batch processing for non-critical updates
- Rate Limiting: Throttle updates to prevent frontend overload

#### Caching Strategy
- Branch Summary: Cache for 30-60 seconds
- Device Status: Cache for 15-30 seconds
- Alert Counts: Real-time (no cache)
- Reports: Cache generated reports for 24 hours
- Static Data: CDN with long TTL

#### Horizontal Scaling
- Stateless Services: All services should be stateless
- Load Balancing: Distribute across multiple instances
- Monitoring Services: Shard by branch ID or region
- Database: Read replicas for query distribution

#### Performance Targets
- Dashboard Load Time: < 3 seconds
- Real-time Update Latency: < 500ms
- Alert Popup Display: < 1 second
- API Response Time (p95): < 200ms
- WebSocket Message Throughput: 10,000 msg/sec
- Concurrent Users: 100+ simultaneous operators

---

## Cost Estimation

### Development Costs
- **Phase 1-2** (4 weeks): $40,000 - $60,000
- **Phase 3-4** (4 weeks): $40,000 - $60,000
- **Phase 5-6** (4 weeks): $30,000 - $45,000
- **Total Development**: $110,000 - $165,000

### Infrastructure Costs (Monthly)
- **Database** (PostgreSQL): $500 - $1,000
- **Application Servers** (4-8 instances): $1,000 - $2,000
- **Redis Cache** (2 instances): $200 - $400
- **Storage** (MinIO/S3, 1TB): $100 - $300
- **CDN** (CloudFlare): $200 - $500
- **Monitoring** (Prometheus/Grafana): $200 - $400
- **Notification Services** (Twilio, SendGrid): $500 - $2,000
  - SMS: ~$0.01 per message
  - Voice: ~$0.02 per minute
  - Email: ~$0.0001 per email
- **Load Balancer**: $100 - $200
- **Total Monthly**: $2,800 - $6,800

### ROI Benefits
- **Reduced Manual Monitoring**: 10+ FTE savings
- **Faster Incident Response**: 60-80% reduction in response time
- **Prevented Losses**: Early detection of failures
- **Compliance**: Automated retention compliance
- **Operational Efficiency**: Centralized vs distributed monitoring

---

## Risk Assessment

### Technical Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| DVR/NVR API compatibility issues | HIGH | Multi-vendor SDK integration, ONVIF fallback |
| WebSocket connection scalability | MEDIUM | Connection pooling, load balancing, sharding |
| Database performance at scale | MEDIUM | Partitioning, read replicas, caching |
| Real-time video streaming latency | MEDIUM | WebRTC for low latency, HLS fallback |
| Notification delivery failures | LOW | Retry logic, multiple providers, delivery tracking |
| Storage exhaustion | LOW | Auto-cleanup policies, capacity monitoring |

### Operational Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| User adoption resistance | MEDIUM | Training, gradual rollout, user feedback |
| Network bandwidth constraints | MEDIUM | Adaptive streaming, compression, bandwidth monitoring |
| Alert fatigue | HIGH | Smart de-duplication, tunable thresholds, ML-based filtering |
| System downtime during deployment | LOW | Blue-green deployment, rollback procedures |

---

## Success Metrics (KPIs)

### System Performance
- ✅ Dashboard loads in < 3 seconds for 400 branches
- ✅ Real-time updates with < 500ms latency
- ✅ 99.9% uptime (< 8.76 hours downtime/year)
- ✅ Support 100+ concurrent users
- ✅ Alert popup displays within 1 second

### Operational Efficiency
- ✅ 80% reduction in manual monitoring effort
- ✅ 60% faster incident response time
- ✅ 95%+ recording retention compliance
- ✅ 90%+ alert acknowledgment within 5 minutes
- ✅ Zero missed critical alerts (P1)

### Business Impact
- ✅ 10+ FTE cost savings from automation
- ✅ 50% reduction in equipment downtime
- ✅ 100% compliance with retention policies
- ✅ Predictive maintenance preventing 70% of failures
- ✅ ROI positive within 12-18 months

---

## Next Steps & Recommendations

### Immediate Actions (Week 1)
1. ✅ Review and approve this gap analysis document
2. ✅ Prioritize features based on business criticality
3. ✅ Finalize technology stack selections
4. ✅ Set up development environment and infrastructure
5. ✅ Create detailed project schedule with milestones
6. ✅ Assign development team and responsibilities

### Phase 1 Kickoff (Week 2)
1. ✅ Database schema design and review
2. ✅ Service architecture design sessions
3. ✅ API contract definitions (OpenAPI spec)
4. ✅ UI/UX mockups and design approval
5. ✅ Development environment setup
6. ✅ CI/CD pipeline configuration

### Pilot Program (After Phase 6)
1. ✅ Select 10-20 pilot branches
2. ✅ Deploy to staging environment
3. ✅ Conduct user training sessions
4. ✅ Gather feedback and iterate
5. ✅ Performance tuning based on real data
6. ✅ Gradual rollout to all 400 branches

---

## Conclusion

This gap analysis identifies **7 critical gaps** that need to be filled to achieve the enterprise surveillance monitoring requirements:

1. **Centralized Multi-Branch Dashboard** (CRITICAL)
2. **DVR/NVR Health Monitoring** (HIGH)
3. **HDD Health & Status Monitoring** (HIGH)
4. **Recording Retention Monitoring** (HIGH)
5. **Internet Connectivity Monitoring** (MEDIUM)
6. **AI Alert Dashboard with Popup System** (CRITICAL)
7. **Multi-Channel Notification System** (CRITICAL)

**Key Strengths**: The existing AI analytics engine provides a world-class foundation with 14 production-ready modules. The challenge is now integration and scaling to enterprise requirements.

**Implementation Timeline**: 12 weeks (3 months) for full implementation across 6 phases.

**Estimated Investment**: $110,000 - $165,000 development + $2,800 - $6,800/month operational costs.

**Expected ROI**: 10+ FTE savings, 60-80% faster incident response, 50% reduction in equipment downtime, ROI positive within 12-18 months.

**Recommendation**: Proceed with phased implementation starting with Phase 1 (Foundation) and Phase 2 (Dashboard), as these provide immediate visibility benefits while the alert and notification systems are being built.

---

**Document Version**: 1.0  
**Created**: July 28, 2026  
**Author**: Kiro AI Development Team  
**Status**: Ready for Review and Approval
