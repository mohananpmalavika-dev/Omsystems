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
