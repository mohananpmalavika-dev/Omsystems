# Incident Management System - Complete Implementation Guide

## Overview

This document describes the complete incident management system that transforms Sentinel from a surveillance viewer into a **Security Operations Platform**.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Analytics Engine                       │
│  (Fire, Weapon, Intrusion, ATM Tampering, Fall Detection)  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ AI Detection Events
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Incident Integration Hook                       │
│  - Maps detection type to severity                          │
│  - Forwards to incident API                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           AI Verification Service                            │
│  - Calculates confidence score (8 factors)                   │
│  - Determines: automatic / operator-required / informational │
│  - Returns recommended severity                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│         Incident Correlation Service                         │
│  - Generates correlation key (tenant+camera+type+zone+time) │
│  - Prevents duplicate incidents                              │
│  - Merges repeated detections                                │
│  - Applies cooldown periods                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼ (Create new incident)
┌─────────────────────────────────────────────────────────────┐
│              Incident Orchestrator                           │
│  - Creates incident in PostgreSQL                            │
│  - Triggers all workflows                                    │
└─────────┬───────────┬───────────┬───────────┬───────────────┘
          │           │           │           │
          ▼           ▼           ▼           ▼
    ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
    │Evidence │ │   SLA   │ │Workflow │ │ Tasks   │
    │Preserv. │ │ & Auto  │ │  State  │ │ Default │
    │         │ │ Assign  │ │ Machine │ │ Create  │
    └─────────┘ └─────────┘ └─────────┘ └─────────┘
```

## Core Services

### 1. Incident Correlation Service

**Purpose:** Prevent one person from generating hundreds of duplicate incidents.

**Features:**
- Correlation key: `tenant + branch + camera + detection type + zone + tracked object + time window`
- Configurable thresholds per detection type
- Cooldown periods after incident closure
- Detection buffering for low-confidence events

**Configuration Example:**
```typescript
'fire': {
  correlationWindow: 60,      // minutes
  cooldownPeriod: 30,         // minutes
  minDetectionsThreshold: 1,  // create immediately
  maxDetectionGap: 10,        // minutes
}

'loitering': {
  correlationWindow: 60,
  cooldownPeriod: 15,
  minDetectionsThreshold: 5,  // require 5 detections
  maxDetectionGap: 10,
}
```

**File:** `src/services/incident-correlation.service.ts`

### 2. Evidence Preservation Service

**Purpose:** Immediately preserve video evidence when incidents are created.

**Features:**
- Automatic pre-roll/post-roll video preservation
- Severity-based preservation periods
- Legal hold application
- Nearby camera preservation
- Checksum generation
- Chain of custody tracking

**Configuration:**
```typescript
'P1': {
  preRollMinutes: 5,
  postRollMinutes: 15,
  applyLegalHold: true,
  includeNearbyCameras: true,
  nearbyCameraRadius: 50,    // meters
}
```

**File:** `src/services/evidence-preservation.service.ts`

### 3. SLA Management & Auto-Assignment Service

**Purpose:** Manage SLA timers, auto-assign incidents, and handle escalations.

**Features:**
- SLA timers per severity level
- Breach detection and auto-escalation
- Assignment strategies:
  - Round-robin
  - Least-loaded
  - On-call schedule
  - Skill-based
  - Location-based
- Workload tracking

**SLA Configuration:**
```typescript
'P1': {
  acknowledgeWithinMinutes: 2,
  investigateWithinMinutes: 5,
  resolveWithinMinutes: 60,
  closeWithinMinutes: 120,
  autoEscalate: true,
}
```

**File:** `src/services/incident-sla.service.ts`

### 4. Incident Workflow Service

**Purpose:** Enforce valid state transitions and mandatory checks.

**16-State Workflow:**
```
new
  → awaiting-verification
    → verified / false-positive
      → assigned
        → acknowledged
          → under-investigation
            → evidence-collection
              → report-preparation
                → pending-review
                  → resolved
                    → closed
                      → reopened
```

**Features:**
- Controlled state transitions
- Role-based permissions
- Mandatory validation gates
- Closure requirements check

**File:** `src/services/incident-workflow.service.ts`

### 5. AI Verification Service

**Purpose:** Determine if AI events should create incidents automatically.

**8-Factor Scoring:**
1. Detection confidence (35%)
2. Rule severity (20%)
3. Camera criticality (15%)
4. Schedule match (10%)
5. Zone criticality (10%)
6. Repeat detections (5%)
7. Supporting events (3%)
8. Device health (2%)

**Verification Modes:**
- `automatic` - Create incident immediately
- `operator-required` - Require operator verification
- `informational` - Log as alert only

**File:** `src/services/ai-verification.service.ts`

### 6. Incident Orchestrator

**Purpose:** Unified coordination of all incident operations.

**Functions:**
- Process AI events with full workflow
- Create manual incidents
- Status transitions with validation
- False-positive marking
- Get investigation workspace data

**File:** `src/services/incident-orchestrator.service.ts`

## Database Schema

All incident operations use the existing comprehensive PostgreSQL schema in `IncidentRepository`:

- `incidents` - Core incident records
- `incident_status_history` - Status change tracking
- `incident_cameras` - Linked cameras
- `incident_video_ranges` - Preserved video segments
- `incident_clips` - Investigation video clips
- `incident_snapshots` - Evidence snapshots
- `incident_evidence_items` - General evidence
- `incident_evidence_packages` - Bundled evidence exports
- `incident_participants` - People involved
- `incident_tasks` - Investigation tasks
- `incident_notes` - Investigation notes
- `incident_events` - Timeline events
- `incident_reports` - Investigation reports
- `incident_police_intimations` - Police notifications
- `incident_police_evidence_transfers` - Evidence handovers
- `incident_insurance_claims` - Insurance claims
- `incident_insurance_documents` - Claim documents
- `incident_secure_shares` - Secure evidence sharing

**File:** `src/database/incident-repository.ts`

## REST API Endpoints

### Core Incident Operations
```
POST   /v1/incidents                      - Create manual incident
GET    /v1/incidents                      - List incidents (with filters)
GET    /v1/incidents/:id                  - Get incident details
PATCH  /v1/incidents/:id                  - Update incident
PATCH  /v1/incidents/:id/status           - Update status
POST   /v1/incidents/:id/assign           - Assign incident
POST   /v1/incidents/:id/escalate         - Escalate incident
POST   /v1/incidents/:id/close            - Close incident
POST   /v1/incidents/:id/reopen           - Reopen incident
```

### Investigation Workspace (Enhanced)
```
POST   /v1/incidents/ai-events            - Process AI detection event
POST   /v1/incidents/create-manual        - Create with full workflow
GET    /v1/incidents/:id/workspace        - Get complete workspace
POST   /v1/incidents/:id/transition       - Transition with validation
POST   /v1/incidents/:id/mark-false-positive
POST   /v1/incidents/:id/extend-preservation
POST   /v1/incidents/:id/release-legal-hold
GET    /v1/incidents/:id/available-transitions
GET    /v1/incidents/:id/closure-validation
GET    /v1/incidents/:id/sla-status
POST   /v1/incidents/:id/generate-report
GET    /v1/incidents/system-statistics
```

### Evidence & Video
```
POST   /v1/incidents/:id/cameras
POST   /v1/incidents/:id/video-ranges
POST   /v1/incidents/:id/preserve-video
POST   /v1/incidents/:id/clips
POST   /v1/incidents/:id/snapshots
POST   /v1/incidents/:id/evidence-items
POST   /v1/incidents/:id/evidence-packages
POST   /v1/evidence-packages/:id/approve
```

### Participants & Timeline
```
POST   /v1/incidents/:id/participants
GET    /v1/incidents/:id/participants
GET    /v1/incidents/:id/timeline
```

### Tasks & Notes
```
POST   /v1/incidents/:id/tasks
GET    /v1/incidents/:id/tasks
PATCH  /v1/tasks/:id
POST   /v1/tasks/:id/complete
POST   /v1/incidents/:id/notes
GET    /v1/incidents/:id/notes
```

### Police & Insurance
```
POST   /v1/incidents/:id/police-intimations
POST   /v1/incidents/:id/police-evidence-transfers
POST   /v1/incidents/:id/insurance-claims
POST   /v1/incidents/:id/insurance-documents
```

### Reports
```
POST   /v1/incidents/:id/reports
GET    /v1/incidents/:id/reports
GET    /v1/incident-reports/:id
POST   /v1/incident-reports/:id/review
POST   /v1/incident-reports/:id/approve
POST   /v1/incident-reports/:id/finalize
```

### Analytics & Dashboard
```
GET    /v1/incidents/dashboard            - Dashboard statistics
GET    /v1/incidents/statistics/:period   - Time-based statistics
```

**Files:**
- `src/routes/incidents.routes.ts` - Core operations
- `src/routes/incident-workspace.routes.ts` - Enhanced workspace APIs

## Analytics Integration

### Integration Hook

Connects AI Analytics Engine to Incident Management:

```typescript
// In analytics engine
import { createIncidentIntegration } from './incident-integration';

const incidentHook = createIncidentIntegration({
  incidentApiUrl: 'http://control-plane:8080',
  apiKey: process.env.INCIDENT_API_KEY,
});

// On detection
await incidentHook.onDetection({
  type: 'fire',
  confidence: 0.92,
  cameraId: 'cam-vault-01',
  timestamp: new Date().toISOString(),
  tenantId: 'bank-branch-network',
  branchId: 'kollam-main',
  zone: 'vault',
});
```

**File:** `analytics-engine/src/incident-integration.ts`

## Frontend UI

### Incident Dashboard

**Features:**
- Dashboard statistics (total, open, critical, avg resolution time)
- View filters (all, critical, open, SLA breach)
- Multi-criteria filters (severity, status, type, branch, date range)
- Color-coded severity badges
- Status indicators
- AI confidence display
- Real-time updates

**File:** `dashboard/app/incidents/page.tsx`

### Investigation Workspace

**Features:**
- 6-tab interface: Overview, Video, Evidence, Tasks, Timeline, Report
- SLA deadline warnings
- Available actions (status transitions)
- Task management with mandatory indicators
- Complete timeline with visual markers
- Evidence item listing
- Video preservation details
- Police/insurance tracking
- Report generation

**File:** `dashboard/app/incidents/[id]/page.tsx`

## Deployment Configuration

### Environment Variables

```env
# Control Plane
DATABASE_URL=postgresql://user:pass@localhost:5432/sentinel
INCIDENT_API_KEY=your-secure-api-key

# Analytics Engine
INCIDENT_API_URL=http://control-plane:8080
INCIDENT_API_KEY=your-secure-api-key
```

### Service Initialization

```typescript
// In app.ts
import { registerIncidentsRoutes } from './routes/incidents.routes.js';
import { registerInvestigationWorkspaceRoutes } from './routes/incident-workspace.routes.js';

// Register routes
await registerIncidentsRoutes(app, store);
await registerInvestigationWorkspaceRoutes(app, store);
```

## Operational Workflow

### 1. AI Detection Event
```
AI Engine detects fire (92% confidence)
  ↓
Integration hook forwards to incident API
  ↓
AI Verification: automatic mode (high score)
  ↓
Correlation: no active incident found
  ↓
Orchestrator creates incident
```

### 2. Incident Creation
```
Incident INC-KOL-202607-000142 created
  ↓
Evidence preservation triggered (5min pre, 15min post)
  ↓
Auto-assigned to on-call security officer
  ↓
SLA timers started (acknowledge: 2min, investigate: 5min)
  ↓
Default tasks created (verify, notify management, report)
  ↓
Notifications sent (SMS, email, mobile app)
```

### 3. Investigation Workflow
```
Officer acknowledges (status: acknowledged)
  ↓
Reviews video footage
  ↓
Transitions to under-investigation
  ↓
Collects evidence (clips, snapshots, documents)
  ↓
Completes tasks
  ↓
Prepares investigation report
  ↓
Supervisor reviews and approves
  ↓
Incident resolved
  ↓
Closure validation (all tasks complete, report approved)
  ↓
Incident closed
```

### 4. False Positive Handling
```
Operator reviews detection
  ↓
Marks as false positive (reason: shadow)
  ↓
Workflow transitions to false-positive status
  ↓
Sample stored for model improvement
  ↓
AI confidence thresholds adjusted
```

## Testing

### Unit Tests
```bash
npm test src/services/incident-correlation.service.test.ts
npm test src/services/evidence-preservation.service.test.ts
npm test src/services/incident-sla.service.test.ts
npm test src/services/incident-workflow.service.test.ts
npm test src/services/ai-verification.service.test.ts
```

### Integration Tests
```bash
npm test src/routes/incident-workspace.routes.test.ts
```

### End-to-End Tests
```bash
npm run test:e2e -- incidents
```

## Monitoring & Metrics

### Key Metrics
- Incidents created (automatic vs manual)
- False positive rate
- Average response time
- Average resolution time
- SLA breach count
- Evidence preservation success rate
- Auto-assignment success rate

### Health Checks
```
GET /v1/incidents/system-statistics

Response:
{
  correlation: {
    activeCorrelations: 5,
    bufferedDetections: 12
  },
  workflow: "...state machine diagram..."
}
```

## Security Considerations

1. **Evidence Integrity**
   - SHA-256 checksums for all video/evidence
   - Immutable chain-of-custody events
   - Legal hold prevents deletion
   - Audit trail for all access

2. **Access Control**
   - Role-based workflow transitions
   - Sensitive incident confidentiality levels
   - Secure evidence sharing with OTP
   - Download tracking

3. **Data Protection**
   - Encrypted evidence packages
   - Watermarking for exports
   - Retention policy enforcement
   - GDPR compliance ready

## Future Enhancements

1. **AI Model Improvement**
   - Automated retraining from false positives
   - Confidence threshold auto-tuning
   - Cross-incident pattern detection

2. **Advanced Analytics**
   - Incident prediction
   - Heat mapping
   - Trend analysis
   - Anomaly detection

3. **Mobile App**
   - Real-time incident notifications
   - Quick response actions
   - Video clip review
   - Task completion

4. **Integration**
   - External alarm systems
   - Building management systems
   - HR systems for employee verification
   - CRM systems for customer incidents

## Support & Documentation

- **API Documentation:** See OpenAPI spec at `/api/docs`
- **Service Architecture:** This document
- **Database Schema:** `src/database/schema.sql`
- **Frontend Components:** `dashboard/components/`

## Conclusion

This incident management system provides a complete, production-ready solution that:

✅ Prevents duplicate incidents with intelligent correlation  
✅ Automatically preserves evidence with legal compliance  
✅ Manages SLAs with auto-escalation  
✅ Enforces controlled workflow with validation gates  
✅ Integrates AI verification with multi-factor scoring  
✅ Provides comprehensive investigation workspace  
✅ Handles police/insurance workflows  
✅ Generates structured reports  
✅ Supports false-positive feedback loop  

The system transforms Sentinel from passive surveillance into an active **Security Operations Platform** with enterprise-grade incident management.
