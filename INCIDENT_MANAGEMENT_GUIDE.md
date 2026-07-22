# Incident Management & Investigation Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Incident Types](#incident-types)
4. [Incident Lifecycle](#incident-lifecycle)
5. [Detection Methods](#detection-methods)
6. [Workflow Stages](#workflow-stages)
7. [Evidence Preservation](#evidence-preservation)
8. [Investigation Workspace](#investigation-workspace)
9. [Police Intimation](#police-intimation)
10. [Insurance Claims](#insurance-claims)
11. [Secure Sharing](#secure-sharing)
12. [API Reference](#api-reference)
13. [Dashboard & Reporting](#dashboard--reporting)
14. [Integration Points](#integration-points)
15. [Best Practices](#best-practices)
16. [Compliance Considerations](#compliance-considerations)

---

## Overview

The Incident Management & Investigation module is a comprehensive system for managing security incidents from detection through closure. It provides end-to-end workflow support for incident triage, investigation, evidence collection, authority coordination, and reporting.

### Key Features

- **Complete lifecycle management** - From detection through closure with 16 workflow statuses
- **Automatic evidence preservation** - Configurable pre-roll and post-roll video capture with legal hold
- **Chain of custody** - Complete audit trail for all evidence handling
- **Multi-camera synchronized playback** - Track incidents across multiple camera views
- **Authority coordination** - Dedicated workflows for police intimation and insurance claims
- **Secure external sharing** - Token-based, time-limited evidence sharing with OTP verification
- **Separation of duties** - Granular permissions prevent conflict of interest
- **RBI compliance** - Meets regulatory requirements for banking and NBFC sectors

### Module Purpose

This module addresses the critical need for:

- Structured incident recording and investigation
- Tamper-proof evidence collection
- Legal compliance in evidence handling
- Efficient coordination with law enforcement and insurers
- Audit-ready documentation
- Data protection and privacy controls

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    Detection Sources                     │
├──────────────┬──────────────┬──────────────┬────────────┤
│   Manual     │  AI Alerts   │   External   │ Historical │
│  Operator    │  Analytics   │   Systems    │   Search   │
└──────┬───────┴──────┬───────┴──────┬───────┴─────┬──────┘
       │              │              │             │
       └──────────────┴──────────────┴─────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Incident Management  │
              │       Engine          │
              └───────────┬───────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │  Video   │    │ Evidence │    │ Timeline │
   │Preservation│    │ Package │    │  Events  │
   └─────┬────┘    └────┬─────┘    └────┬─────┘
         │              │               │
         └──────────────┴───────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │  Police  │    │Insurance │    │  Secure  │
   │Intimation│    │  Claims  │    │ Sharing  │
   └──────────┘    └──────────┘    └──────────┘
```

### Data Flow

1. **Incident Detection** → System creates incident record with unique number (INC-XX-YYYY-NNNNNN)
2. **Triage** → Operator verifies, classifies, and assigns priority
3. **Preservation** → System automatically preserves video with legal hold
4. **Investigation** → Investigator collects evidence, interviews, and documents timeline
5. **Package Creation** → Evidence officer creates tamper-proof evidence packages
6. **Approval** → Senior management approves packages for external sharing
7. **Authority Coordination** → Police intimation and insurance claims managed
8. **Closure** → Report approved, corrective actions completed, incident closed

### Integration with Existing Modules

- **Recording Engine** - Preserves video segments with SHA-256 checksums
- **Legal Hold System** - Prevents retention cleanup of incident evidence
- **Alert System** - Automatically creates incidents from critical AI detections
- **Access Control** - Hierarchical RBAC enforces permissions
- **Audit System** - Logs all evidence operations for compliance

---

## Incident Types

### Standard Categories


| Type | Typical Priority | Police Required | Description |
|------|-----------------|-----------------|-------------|
| `theft-or-robbery` | P1 (Critical) | Yes | Armed or unarmed theft |
| `fire-or-emergency` | P1 (Critical) | Yes | Fire, medical emergency |
| `atm-tampering` | P1/P2 | Yes | ATM skimming, physical damage |
| `unauthorized-access` | P2 (High) | Depends | Restricted area breach |
| `suspicious-activity` | P2/P3 | Depends | Loitering, unusual behavior |
| `accident-or-injury` | P2/P3 | Depends | Slip/fall, workplace injury |
| `vandalism` | P3 (Medium) | Depends | Property damage |
| `customer-dispute` | P3/P4 | No | Service complaint, argument |
| `cash-shortage-excess` | P2/P3 | Depends | Teller discrepancy |
| `vault-access-violation` | P1/P2 | Yes | Unauthorized vault entry |
| `locker-room-incident` | P2/P3 | Depends | Safe deposit box issue |
| `employee-misconduct` | P2/P3 | No | Policy violation |
| `fraud-suspicion` | P1/P2 | Yes | Identity fraud, forgery |
| `camera-tampering` | P2 (High) | Depends | Camera disabled or obstructed |
| `panic-button-activation` | P1 (Critical) | Yes | Duress signal |
| `vehicle-incident` | P3/P4 | Depends | Parking lot accident |
| `false-alarm` | P5 (Info) | No | Verified false positive |
| `other` | P3 (Medium) | Depends | Uncategorized incident |

**Note:** Incident types are configurable per organization.

---

## Incident Lifecycle

### Workflow Statuses


```
draft → new → acknowledged → under-triage → assigned
  → under-investigation → awaiting-information → escalated
  → police-intimated → insurance-submitted → resolved
  → closed → reopened → cancelled → false-alarm
```

### Status Definitions

| Status | Description | Typical Actions |
|--------|-------------|-----------------|
| `draft` | Incomplete incident record | Finalize details, submit |
| `new` | Newly created, awaiting response | Acknowledge, review |
| `acknowledged` | Operator aware, needs triage | Verify, classify |
| `under-triage` | Being evaluated | Determine severity, assign |
| `assigned` | Investigator assigned | Begin investigation |
| `under-investigation` | Active investigation | Collect evidence, interview |
| `awaiting-information` | Blocked pending data | Request documents, follow up |
| `escalated` | Senior management involved | Executive review |
| `police-intimated` | Law enforcement notified | Coordinate evidence transfer |
| `insurance-submitted` | Claim filed | Await surveyor, provide docs |
| `resolved` | Issue addressed | Review, close |
| `closed` | Incident complete | Archive, lessons learned |
| `reopened` | Closed incident reopened | Resume investigation |
| `cancelled` | Incident invalid | Document reason |
| `false-alarm` | Verified false positive | Mark for analytics |

### Priority Levels (Severity)

| Priority | Name | Response Time | Description |
|----------|------|---------------|-------------|
| P1 | Critical | 1 min ack, 5 min investigation | Active threat, safety risk |
| P2 | High | 5 min ack, 15 min investigation | Security breach, significant loss |
| P3 | Medium | 15 min ack, 1 hour investigation | Policy violation, minor incident |
| P4 | Low | 1 hour ack, same day investigation | Administrative issue |
| P5 | Informational | No SLA | Logging purposes only |

**Note:** Response times are configurable per organization.

---

## Detection Methods


### 1. Manual Detection

**Created by:**
- Control room operator
- Branch employee
- Security guard
- Branch manager
- Mobile app user

**Creation points:**
- Live camera view
- Playback screen
- Alert panel
- Bookmark
- Branch dashboard
- Mobile application

**API Example:**

```bash
POST /v1/incidents
Content-Type: application/json

{
  "title": "Suspicious loitering near ATM",
  "description": "Male subject observed near ATM for 20+ minutes",
  "incidentType": "suspicious-activity",
  "severity": "P3",
  "branchId": "branch-uuid",
  "occurredAt": "2026-07-22T14:30:00Z",
  "detectionSource": "manual-operator",
  "policeRequired": false
}
```

### 2. AI Alert Detection

AI events initially create **alerts**, not incidents. Operator verifies before promoting to incident.

**Workflow:**
```
AI event → Alert generated → Operator reviews → Create incident OR Mark false alarm
```

**High-confidence critical events** (fire, intrusion) may auto-create incidents.

**API Example:**


```bash
POST /v1/incidents
{
  "title": "Intrusion detected - Perimeter fence",
  "incidentType": "unauthorized-access",
  "severity": "P1",
  "branchId": "branch-uuid",
  "occurredAt": "2026-07-22T02:15:30Z",
  "detectionSource": "ai-analytics",
  "relatedAlertId": "alert-uuid"
}
```

### 3. External System Detection

**Possible sources:**
- ATM switch (dispenser fault, cash trap)
- Access control (forced door, tailgating)
- Panic button
- Fire alarm panel
- Intrusion alarm
- POS/core banking (transaction anomaly)
- Security guard app
- Customer complaint system
- Fraud monitoring

**Integration approach:** External systems call the incident creation API with appropriate metadata.

### 4. Post-Event Discovery

Incidents can be created from historical footage search.

**Workflow:**
```
Search recordings → Identify event → Create incident → Preserve evidence
```

---

## Workflow Stages

### Stage 1: Incident Creation

**Permissions required:** `incident:create`

**Actions:**
1. Detect or observe incident
2. Create incident record with title, type, severity
3. System assigns unique incident number (e.g., `INC-KL-2026-000184`)
4. Status set to `new`


**API:**
```bash
POST /v1/incidents
```

### Stage 2: Acknowledgement & Triage

**Permissions required:** `incident:view`, `incident:update`

**Triage questions:**
- Is the event genuine?
- Is anyone in immediate danger?
- Is emergency response required?
- Which cameras are relevant?
- Which time period must be preserved?
- Is financial loss involved?
- Does it affect other locations?
- Should management be notified?
- Should access be restricted?

**Actions:**
1. Acknowledge incident
2. Verify details
3. Update severity if needed
4. Identify relevant cameras
5. Preserve video evidence
6. Add participants (persons involved)

**API:**
```bash
PATCH /v1/incidents/:id/status
{ "status": "acknowledged" }

POST /v1/incidents/:id/cameras
{ "cameraId": "cam-uuid", "isPrimary": true }

POST /v1/incidents/:id/preserve-video
{
  "cameraId": "cam-uuid",
  "incidentTime": "2026-07-22T14:30:00Z",
  "preRollMinutes": 10,
  "postRollMinutes": 20
}
```

### Stage 3: Assignment

**Permissions required:** `incident:assign`


**Actions:**
1. Select appropriate investigator
2. Assign incident
3. Notify investigator
4. Set expected completion date

**API:**
```bash
POST /v1/incidents/:id/assign
{ "userId": "investigator-uuid" }
```

### Stage 4: Investigation

**Permissions required:** `investigation:manage`, `evidence:create`

**Activities:**
- Review video footage (multi-camera synchronized playback)
- Create video clips and snapshots
- Interview witnesses and participants
- Collect documentary evidence
- Document timeline
- Add investigation notes
- Create evidence items
- Enhance video if needed

**API Examples:**

```bash
# Create video clip
POST /v1/incidents/:id/clips
{
  "cameraId": "cam-uuid",
  "sourceSegmentIds": ["seg1", "seg2"],
  "startTime": "2026-07-22T14:28:00Z",
  "endTime": "2026-07-22T14:35:00Z",
  "clipType": "investigation-copy",
  "hasTimestamp": true,
  "notes": "Subject entering restricted area"
}

# Create snapshot
POST /v1/incidents/:id/snapshots
{
  "cameraId": "cam-uuid",
  "timestamp": "2026-07-22T14:30:15Z",
  "snapshotType": "original",
  "description": "Clear face capture"
}

# Add evidence item
POST /v1/incidents/:id/evidence-items
{
  "itemType": "document",
  "title": "Access log showing unauthorized entry",
  "checksumSha256": "abc123..."
}

# Add investigation note
POST /v1/incidents/:id/notes
{
  "noteType": "investigation",
  "content": "Subject matches description from previous incident..."
}
```

### Stage 5: Evidence Package Creation

**Permissions required:** `evidence:export-package`


**Actions:**
1. Create evidence package selecting items to include
2. System generates manifest with checksums
3. Package enters `pending-approval` status

**Package contents:**
- Original video segments (untouched)
- Investigation clips (derived)
- Snapshots
- Incident timeline
- AI event records
- Alert logs
- Operator notes
- Camera details
- Timestamp verification
- Hash verification report
- Chain of custody report
- Documents

**API:**
```bash
POST /v1/incidents/:id/evidence-packages
{
  "title": "Evidence Package for Police FIR 123/2026",
  "description": "Complete video evidence for robbery incident",
  "includeOriginalVideo": true,
  "includeInvestigationClips": true,
  "includeSnapshots": true,
  "includeTimeline": true,
  "includeAlertLogs": true,
  "includeDocuments": true
}
```

### Stage 6: Evidence Approval

**Permissions required:** `evidence:approve`

**Important:** Evidence creators cannot approve their own packages (separation of duties).

**Actions:**
1. Senior manager/legal team reviews package
2. Verify chain of custody
3. Check checksums
4. Approve or reject

**API:**
```bash
POST /v1/evidence-packages/:id/approve
```

### Stage 7: Authority Coordination

#### Police Intimation

**Permissions required:** `police:update`

**Actions:**
1. Create police intimation record
2. Record police station, officer details
3. Update with GD/FIR number when available
4. Transfer evidence
5. Track investigation progress

**API:**


```bash
# Create intimation
POST /v1/incidents/:id/police-intimations
{
  "policeStation": "Koramangala Police Station",
  "policeStationAddress": "Bangalore, Karnataka",
  "intimationMethod": "in-person",
  "intimatedAt": "2026-07-22T16:00:00Z",
  "officerName": "Inspector Sharma",
  "officerContact": "+91-XXXXXXXXXX"
}

# Update with FIR details
PATCH /v1/police-intimations/:id
{
  "firNumber": "123/2026",
  "firDate": "2026-07-22T18:00:00Z",
  "status": "fir-filed",
  "investigationOfficer": "SI Kumar"
}

# Record evidence transfer
POST /v1/police-intimations/:id/evidence-transfers
{
  "policeIntimationId": "intimation-uuid",
  "transferDate": "2026-07-23T10:00:00Z",
  "evidencePackageId": "package-uuid",
  "evidenceDescription": "Video footage and snapshots",
  "recipientName": "SI Kumar",
  "transferMethod": "secure-link"
}
```

#### Insurance Claims

**Permissions required:** `insurance:update`

**Actions:**
1. Create insurance claim
2. Attach evidence
3. Track surveyor visit
4. Update claim status
5. Record settlement

**API:**

```bash
# Create claim
POST /v1/incidents/:id/insurance-claims
{
  "insuranceCompany": "XYZ Insurance Ltd",
  "policyNumber": "POL123456",
  "dateOfLoss": "2026-07-22T14:30:00Z",
  "estimatedLoss": 50000,
  "claimAmount": 50000
}

# Update claim status
PATCH /v1/insurance-claims/:id
{
  "claimNumber": "CLM789",
  "surveyorName": "Mr. Patel",
  "surveyDate": "2026-07-25T11:00:00Z",
  "status": "survey-completed",
  "settlementAmount": 45000
}
```

### Stage 8: Closure

**Permissions required:** `incident:close`, `incident-report:approve`


**Pre-closure requirements:**
- All mandatory tasks completed
- Evidence approved
- Report finalized
- Corrective actions documented

**API:**
```bash
# Create final report
POST /v1/incidents/:id/reports
{
  "reportType": "final",
  "executiveSummary": "Robbery attempt at ATM cabin...",
  "findings": "Security protocols were followed...",
  "rootCause": "Inadequate perimeter lighting",
  "correctiveActions": "Install additional lights",
  "preventiveActions": "Regular security audits"
}

# Approve report
POST /v1/incident-reports/:id/approve

# Close incident
POST /v1/incidents/:id/close
{ "notes": "All actions completed, no further follow-up required" }
```

---

## Evidence Preservation

### Automatic Video Preservation

When an incident is created, the system automatically:

1. Identifies relevant recording segments
2. Verifies SHA-256 checksums
3. Applies legal hold (prevents deletion)
4. Blocks retention cleanup
5. Optionally copies to Evidence Vault
6. Records preservation in chain of custody

**Configurable time windows:**

| Incident Type | Pre-event | Post-event |
|--------------|-----------|------------|
| Robbery | 15 min | 60 min |
| ATM tampering | 10 min | 30 min |
| Unauthorized access | 5 min | 20 min |
| Customer dispute | 10 min | 20 min |
| Accident | 10 min | 30 min |
| Fire | 10 min | Until incident ends |

**API:**


```bash
POST /v1/incidents/:id/preserve-video
{
  "cameraId": "cam-uuid",
  "incidentTime": "2026-07-22T14:30:00Z",
  "preRollMinutes": 10,
  "postRollMinutes": 20
}

# Response includes legal hold details
{
  "id": "range-uuid",
  "incidentId": "incident-uuid",
  "cameraId": "cam-uuid",
  "fromAt": "2026-07-22T14:20:00Z",
  "toAt": "2026-07-22T14:50:00Z",
  "legalHoldApplied": true,
  "legalHoldId": "hold-uuid",
  "checksumSha256": "abc123...",
  "preservedBy": "user-uuid",
  "preservedAt": "2026-07-22T14:35:00Z"
}
```

### Video Clipping

Create derived clips WITHOUT modifying originals:

**Two versions maintained:**
1. **Original source** - Untouched recording segments with original checksums
2. **Investigation clip** - Selected interval, may be converted to MP4, watermarked

**Enhancement operations:**
- Digital zoom
- Brightness/contrast adjustment
- Sharpening
- Noise reduction
- Stabilization
- Frame enlargement
- Slow motion

**Important:** Enhanced footage is an investigative aid, not untouched evidence. Every enhancement operation is logged.

**API:**
```bash
POST /v1/incidents/:id/clips
{
  "cameraId": "cam-uuid",
  "sourceSegmentIds": ["seg1-uuid", "seg2-uuid"],
  "startTime": "2026-07-22T14:28:00Z",
  "endTime": "2026-07-22T14:35:00Z",
  "clipType": "investigation-copy",
  "hasWatermark": true,
  "hasTimestamp": true,
  "notes": "Enhanced for face identification"
}
```

### Chain of Custody

Every evidence operation records:
- Who accessed
- When accessed
- What operation
- Original checksum
- Derived checksum (if modified)
- Purpose/reason
- Approval status

Automatically logged operations:
- Video preservation
- Clip creation
- Snapshot capture
- Enhancement
- Package creation
- Package approval
- External sharing
- Downloads

---

## Investigation Workspace


### Workspace Components

Each incident has a dedicated workspace containing:

1. **Incident Summary** - Details, status, priority, assignments
2. **People & Entities** - Participants (customers, employees, witnesses)
3. **Cameras** - All involved camera feeds
4. **Alerts** - Related AI detections
5. **Timeline** - Chronological event log (append-only)
6. **Evidence** - Video clips, snapshots, documents
7. **Tasks** - Corrective actions and follow-ups
8. **Notes** - Investigation observations (confidential)
9. **Police Records** - Intimation, FIR, transfers
10. **Insurance Records** - Claims, surveyor reports
11. **Approvals** - Evidence package approvals
12. **Audit History** - Complete access log

### Investigation Timeline

The timeline combines:
- AI detections
- Alerts
- Live view sessions
- Camera recordings
- Bookmarks
- Snapshots
- Operator actions
- Access control events
- ATM/transaction events
- Police intimation
- Insurance submission
- Evidence exports
- Status changes

**Example timeline:**
```
10:40:14 - Person entered restricted area (AI detection)
10:40:18 - Tampering alert generated
10:40:29 - Control room operator acknowledged
10:41:02 - Branch manager notified
10:42:10 - Incident INC-KL-2026-000184 created
10:43:05 - Camera 03 and 05 video preserved
10:48:22 - Police control room informed
11:05:10 - Evidence package PKG-001 generated
11:30:45 - Evidence package approved by Sr. Manager
14:15:30 - Evidence transferred to police (FIR 123/2026)
```

**Timeline is append-only** - corrections create new entries rather than deleting.

**API:**
```bash
GET /v1/incidents/:id/timeline
```

### Multi-Camera Synchronized Playback

For incidents spanning multiple cameras:


**Shared controls:**
- Master clock (all players synchronized)
- Common play/pause
- Common playback speed (0.25x - 2x)
- Common seek control
- Time-offset correction
- Frame-by-frame navigation
- Incident markers

**Example: Tracking movement across location**
```
Camera 1 - Branch entrance
Camera 2 - Lobby
Camera 3 - Teller area
Camera 4 - Exit

All synchronized to incident time, showing subject path
```

### Participants Management

Track all persons involved:

**API:**
```bash
POST /v1/incidents/:id/participants
{
  "role": "suspect",
  "personType": "visitor",
  "name": "John Doe (pseudonym)",
  "contactPhone": "+91-XXXXXXXXXX",
  "notes": "Approx 30 years, 5'10\", wearing blue jacket"
}

GET /v1/incidents/:id/participants
```

**Person types:** customer, employee, vendor, visitor, unknown

**Roles:** suspect, witness, victim, reporting-person, responder, investigator, approver

---

## Police Intimation

### Workflow

```
Incident requires police → Approval obtained → Intimation prepared
  → Police station notified → GD/FIR number recorded
  → Evidence package approved → Securely transferred
  → Receipt acknowledged → Investigation tracking
```

### Police Intimation Record

**Fields tracked:**
- Police station name and address
- Date and time informed
- Method (in-person, email, phone, portal)
- Officer name and designation
- GD (General Diary) number
- FIR number and date
- Complaint copy
- Acknowledgement
- Evidence requested
- Evidence supplied
- Investigation officer
- Follow-up dates
- Case status


### Police Intimation Statuses

| Status | Description |
|--------|-------------|
| `pending` | Intimation required but not yet done |
| `intimated` | Police informed, awaiting GD/FIR |
| `gd-recorded` | General Diary entry recorded |
| `fir-filed` | First Information Report filed |
| `under-investigation` | Police investigating |
| `charge-sheet-filed` | Charge sheet submitted to court |
| `evidence-requested` | Police requested additional evidence |
| `evidence-provided` | Evidence transferred to police |
| `closed` | Police investigation concluded |
| `not-required` | Police intimation deemed unnecessary |

### Evidence Transfer to Police

Every transfer creates a chain-of-custody record:

**API:**
```bash
POST /v1/police-intimations/:id/evidence-transfers
{
  "policeIntimationId": "intimation-uuid",
  "transferDate": "2026-07-23T10:00:00Z",
  "evidencePackageId": "package-uuid",
  "evidenceDescription": "Video footage from 4 cameras, 20 snapshots",
  "recipientName": "Sub-Inspector Kumar",
  "recipientDesignation": "Investigating Officer",
  "transferMethod": "secure-link",
  "notes": "Shared via encrypted portal, expires in 7 days"
}

GET /v1/police-intimations/:id/evidence-transfers
```

### Legal Compliance

- System tracks the process, not declares legal compliance
- Deadlines and mandatory steps configurable per institution
- Legal/compliance team defines requirements
- External legal requirements vary by jurisdiction

---

## Insurance Claims

### Workflow

```
Incident with loss → Claim preparation → Policy verification
  → Claim submission → Surveyor assigned → Evidence provided
  → Survey completed → Claim assessment → Settlement/Rejection
```

### Insurance Claim Record

**Fields tracked:**
- Insurance company
- Policy number
- Claim number
- Date of loss
- Estimated loss
- Claim amount
- Submission date
- Submitted by
- Surveyor name and contact
- Survey date
- Claim status
- Settlement amount
- Settlement date
- Rejection reason
- Documents attached


### Insurance Claim Statuses

| Status | Description |
|--------|-------------|
| `not-required` | No insurance claim needed |
| `to-be-filed` | Claim preparation in progress |
| `prepared` | Ready for submission |
| `submitted` | Claim filed with insurer |
| `additional-info-required` | Insurer requested more information |
| `survey-scheduled` | Surveyor visit scheduled |
| `survey-in-progress` | Surveyor inspecting |
| `survey-completed` | Survey report submitted |
| `approved` | Claim approved |
| `partially-approved` | Partial claim approval |
| `rejected` | Claim rejected |
| `settled` | Payment received |
| `closed` | Claim process complete |

### API Examples

```bash
# Create insurance claim
POST /v1/incidents/:id/insurance-claims
{
  "insuranceCompany": "New India Assurance",
  "policyNumber": "BKG/2025/12345",
  "dateOfLoss": "2026-07-22T14:30:00Z",
  "estimatedLoss": 150000,
  "claimAmount": 150000,
  "notes": "ATM cash dispenser damaged in attempted robbery"
}

# Update with surveyor details
PATCH /v1/insurance-claims/:id
{
  "claimNumber": "CLM/2026/789",
  "submittedDate": "2026-07-23T10:00:00Z",
  "surveyorName": "Mr. Rajesh Patel",
  "surveyorContact": "+91-XXXXXXXXXX",
  "surveyDate": "2026-07-25T14:00:00Z",
  "status": "survey-scheduled"
}

# Add supporting documents
POST /v1/insurance-claims/:id/documents
{
  "claimId": "claim-uuid",
  "documentType": "video-evidence",
  "documentTitle": "CCTV footage of incident",
  "documentPath": "/evidence/packages/PKG-001.zip"
}

# Final settlement
PATCH /v1/insurance-claims/:id
{
  "status": "settled",
  "settlementAmount": 145000,
  "settlementDate": "2026-08-15T10:00:00Z"
}
```

---

## Secure Sharing

### Architecture

Do NOT share raw storage paths or permanent public links.


**Secure workflow:**
```
Evidence approval → Encrypted package → Short-lived token
  → Recipient verification → OTP validation
  → Download logged → Link expires
```

### Security Controls

- ✅ Explicit approval required
- ✅ Recipient name and organization recorded
- ✅ Verified email or official contact
- ✅ One-time password (OTP) for additional security
- ✅ Short expiry (configurable, e.g., 7 days)
- ✅ Download limit (default: 1, max: 10)
- ✅ Strong encryption
- ✅ Watermark (optional)
- ✅ Complete access logging
- ✅ Revocation capability
- ✅ Receipt acknowledgement

### Creating Secure Shares

**API:**
```bash
POST /v1/incidents/:id/secure-shares
{
  "evidencePackageId": "package-uuid",
  "recipientName": "Sub-Inspector Kumar",
  "recipientOrganization": "Koramangala Police Station",
  "recipientEmail": "si.kumar@police.gov.in",
  "purpose": "Evidence for FIR 123/2026 - Robbery investigation",
  "maxDownloads": 2,
  "expiresAt": "2026-07-30T23:59:59Z",
  "watermarked": true,
  "encrypted": true
}

# Response
{
  "id": "share-uuid",
  "incidentId": "incident-uuid",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "accessUrl": "https://evidence.aditisentinel.com/share/eyJhbGci...",
  "oneTimePassword": "8A4C2E9F",
  "expiresAt": "2026-07-30T23:59:59Z",
  "status": "active"
}
```

### Verifying and Downloading

**Recipient workflow:**

1. Receive secure link via official channel
2. Receive OTP via separate channel (SMS/email)
3. Click link, enter OTP
4. Download encrypted package
5. System logs download, decrements counter

**API:**

```bash
# Verify token and OTP
POST /v1/secure-shares/verify
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "oneTimePassword": "8A4C2E9F"
}

# Download (after verification)
POST /v1/secure-shares/:id/download
# Returns download URL or initiates download

# Check share status
GET /v1/incidents/:id/secure-shares

# Revoke access
POST /v1/secure-shares/:id/revoke
{
  "reason": "Investigation concluded, access no longer needed"
}
```

### Highly Sensitive Evidence

For critical incidents, additional options:
- Encrypted physical media (DVD/USB)
- Secure evidence portal
- Organization-to-organization secure transfer
- In-person handover with signed receipt

---

## API Reference

### Core Incident Operations

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| POST | `/v1/incidents` | Create incident | `incident:create` |
| GET | `/v1/incidents` | List incidents | `incident:view` |
| GET | `/v1/incidents/:id` | Get incident details | `incident:view` |
| PATCH | `/v1/incidents/:id` | Update incident | `incident:update` |
| PATCH | `/v1/incidents/:id/status` | Update status | `incident:update` |
| POST | `/v1/incidents/:id/assign` | Assign to investigator | `incident:assign` |
| POST | `/v1/incidents/:id/escalate` | Escalate to management | `incident:escalate` |
| POST | `/v1/incidents/:id/close` | Close incident | `incident:close` |
| POST | `/v1/incidents/:id/reopen` | Reopen incident | `incident:reopen` |

### Participants

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/incidents/:id/participants` | Add participant |
| GET | `/v1/incidents/:id/participants` | List participants |

### Cameras and Video

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| POST | `/v1/incidents/:id/cameras` | Add camera | `investigation:manage` |
| GET | `/v1/incidents/:id/cameras` | List cameras | `investigation:view` |
| POST | `/v1/incidents/:id/video-ranges` | Add video range | `evidence:preserve` |
| POST | `/v1/incidents/:id/preserve-video` | Auto-preserve video | `evidence:preserve` |
| GET | `/v1/incidents/:id/video-ranges` | List video ranges | `investigation:view` |


### Timeline

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/incidents/:id/timeline` | Get complete timeline |

### Evidence

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| POST | `/v1/incidents/:id/clips` | Create video clip | `evidence:create` |
| GET | `/v1/incidents/:id/clips` | List clips | `evidence:view` |
| POST | `/v1/incidents/:id/snapshots` | Create snapshot | `evidence:create` |
| GET | `/v1/incidents/:id/snapshots` | List snapshots | `evidence:view` |
| POST | `/v1/incidents/:id/evidence-items` | Add evidence item | `evidence:create` |
| GET | `/v1/incidents/:id/evidence-items` | List evidence items | `evidence:view` |

### Evidence Packages

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| POST | `/v1/incidents/:id/evidence-packages` | Create package | `evidence:export-package` |
| GET | `/v1/incidents/:id/evidence-packages` | List packages | `evidence:view` |
| GET | `/v1/evidence-packages/:id` | Get package details | `evidence:view` |
| POST | `/v1/evidence-packages/:id/approve` | Approve package | `evidence:approve` |
| POST | `/v1/evidence-packages/:id/download` | Download package | `evidence:view` |

### Police Intimation

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| POST | `/v1/incidents/:id/police-intimations` | Create intimation | `police:update` |
| GET | `/v1/incidents/:id/police-intimations` | List intimations | `incident:view` |
| PATCH | `/v1/police-intimations/:id` | Update intimation | `police:update` |
| POST | `/v1/police-intimations/:id/evidence-transfers` | Record transfer | `police:update` |
| GET | `/v1/police-intimations/:id/evidence-transfers` | List transfers | `incident:view` |

### Insurance Claims

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| POST | `/v1/incidents/:id/insurance-claims` | Create claim | `insurance:update` |
| GET | `/v1/incidents/:id/insurance-claims` | List claims | `incident:view` |
| PATCH | `/v1/insurance-claims/:id` | Update claim | `insurance:update` |
| POST | `/v1/insurance-claims/:id/documents` | Add document | `insurance:update` |
| GET | `/v1/insurance-claims/:id/documents` | List documents | `incident:view` |


### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/incidents/:id/tasks` | Create task |
| GET | `/v1/incidents/:id/tasks` | List tasks |
| PATCH | `/v1/tasks/:id` | Update task |
| POST | `/v1/tasks/:id/complete` | Mark task complete |

### Notes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/incidents/:id/notes` | Add note |
| GET | `/v1/incidents/:id/notes` | List notes |
| PATCH | `/v1/notes/:id` | Update note |
| DELETE | `/v1/notes/:id` | Delete note |

### Secure Sharing

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| POST | `/v1/incidents/:id/secure-shares` | Create share link | `evidence:share` |
| GET | `/v1/incidents/:id/secure-shares` | List shares | `evidence:view` |
| POST | `/v1/secure-shares/verify` | Verify token+OTP | Public |
| POST | `/v1/secure-shares/:id/download` | Download evidence | Verified |
| POST | `/v1/secure-shares/:id/revoke` | Revoke access | `evidence:share` |

### Reports

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| POST | `/v1/incidents/:id/reports` | Create report | `investigation:manage` |
| GET | `/v1/incidents/:id/reports` | List reports | `incident:view` |
| GET | `/v1/incident-reports/:id` | Get report | `incident:view` |
| PATCH | `/v1/incident-reports/:id` | Update report | `investigation:manage` |
| POST | `/v1/incident-reports/:id/review` | Submit for review | `investigation:manage` |
| POST | `/v1/incident-reports/:id/approve` | Approve report | `incident-report:approve` |
| POST | `/v1/incident-reports/:id/finalize` | Finalize report | `incident-report:approve` |

### Dashboard & Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/incidents/dashboard` | Get dashboard metrics |
| GET | `/v1/incidents/analytics/by-type` | Incidents by type |
| GET | `/v1/incidents/analytics/by-severity` | Incidents by severity |
| GET | `/v1/incidents/analytics/by-status` | Incidents by status |
| GET | `/v1/incidents/analytics/response-times` | Average response times |

---

## Dashboard & Reporting

### Dashboard Metrics


**API:**
```bash
GET /v1/incidents/dashboard?branchId=branch-uuid&from=2026-07-01&to=2026-07-31

# Response
{
  "totalIncidents": 45,
  "openIncidents": 12,
  "criticalIncidents": 3,
  "avgResolutionTimeHours": 48.5,
  "incidentsByType": [
    { "type": "suspicious-activity", "count": 15 },
    { "type": "customer-dispute", "count": 10 },
    { "type": "unauthorized-access", "count": 8 }
  ],
  "incidentsBySeverity": [
    { "severity": "P1", "count": 3 },
    { "severity": "P2", "count": 8 },
    { "severity": "P3", "count": 25 }
  ],
  "incidentsByStatus": [
    { "status": "under-investigation", "count": 8 },
    { "status": "assigned", "count": 4 },
    { "status": "closed", "count": 33 }
  ]
}
```

### Incident Reports

Report types:
- **Preliminary** - Initial assessment (24 hours)
- **Investigation** - Detailed findings (during investigation)
- **Final** - Complete incident report (at closure)
- **Executive summary** - High-level overview for management

**Report sections:**
1. Incident identification
2. Executive summary
3. Location and time
4. Persons involved
5. Detection method
6. Detailed chronology
7. Video and evidence reviewed
8. Findings
9. Financial loss or injury
10. Police action
11. Insurance action
12. Root cause
13. Control failures
14. Corrective actions
15. Preventive actions
16. Approvals
17. Evidence index
18. Chain of custody summary

**Report workflow:**
```
Draft → In Review → Approved → Finalized
```

**API:**
```bash
# Create report
POST /v1/incidents/:id/reports
{
  "reportType": "final",
  "executiveSummary": "Attempted robbery at ATM cabin...",
  "detailedChronology": "At 14:28, suspect approached...",
  "findings": "Security protocols followed, rapid response...",
  "rootCause": "Inadequate perimeter lighting enabled approach",
  "correctiveActions": "Installed 2 additional flood lights",
  "preventiveActions": "Monthly security audit, lighting checks"
}

# Submit for approval
POST /v1/incident-reports/:id/review

# Approve (senior management)
POST /v1/incident-reports/:id/approve

# Finalize (lock report)
POST /v1/incident-reports/:id/finalize
```

---

## Integration Points

### Recording Engine


**Integration:** Incident module queries recording segments and applies legal holds

**Flow:**
1. Incident created with camera and time range
2. Recording engine identifies segments
3. Verifies SHA-256 checksums
4. Applies legal hold tag
5. Blocks retention cleanup
6. Optionally copies to central Evidence Vault

**Database tables:**
- `recording_segments` - Time-based video segments
- `recording_segment_hashes` - SHA-256 checksums
- `legal_holds` - Retention overrides

### Alert System

**Integration:** Critical alerts automatically create incidents

**Flow:**
1. AI analytics generates event (fire, intrusion)
2. Alert created with severity
3. If critical + high confidence → Auto-create incident
4. Link alert to incident
5. Include alert metadata in incident timeline

**Configuration:** Auto-incident thresholds configurable per alert type

### Access Control

**Integration:** Access events enrich incident timeline

**Examples:**
- Unauthorized badge swipe
- Forced door
- Tailgating detection
- Failed biometric attempt

**Flow:**
1. Access control event occurs
2. If incident exists for location+time → Add to timeline
3. If critical violation → Create incident

### ATM/POS Systems

**Integration:** Transaction events linked to incidents

**Examples:**
- Dispenser fault
- Cash trap
- Transaction reversal
- Card skimming alert

**Flow:**
1. ATM generates event
2. Create incident with transaction reference
3. Preserve video from ATM internal + external cameras
4. Link transaction log to evidence

### Core Banking

**Integration:** Fraud detection triggers investigation

**Examples:**

- Large cash withdrawal
- Multiple failed PIN attempts
- Account takeover attempt
- Check fraud

**Flow:**
1. Core banking flags suspicious transaction
2. Creates incident with customer reference
3. Preserves video from relevant cameras
4. Investigation reviews video + transaction

### Mobile Application

**Integration:** Branch staff can create incidents from mobile app

**Capabilities:**
- Report incidents from branch floor
- Attach photos
- Record audio notes
- Emergency panic button
- View assigned incidents

---

## Best Practices

### 1. Incident Classification

✅ **Do:**
- Classify accurately at triage
- Update severity if situation changes
- Use consistent incident types
- Document classification reasoning

❌ **Don't:**
- Over-classify minor events as critical
- Leave incidents unclassified
- Change types without justification

### 2. Evidence Preservation

✅ **Do:**
- Preserve immediately upon incident creation
- Use generous time buffers (wider better than narrow)
- Apply legal hold to prevent deletion
- Verify checksums
- Document preservation in notes

❌ **Don't:**
- Delay preservation
- Preserve only exact incident time
- Modify original recordings
- Skip checksum verification

### 3. Investigation

✅ **Do:**
- Review all relevant cameras
- Document timeline comprehensively
- Interview witnesses promptly
- Collect supporting documents
- Maintain confidentiality
- Use multi-camera synchronized playback
- Create clear snapshots with descriptions

❌ **Don't:**
- Rely on single camera view
- Skip timeline documentation
- Delay interviews (memory fades)
- Share confidential details inappropriately
- Enhance evidence without logging

### 4. Evidence Packages

✅ **Do:**
- Include original untouched segments
- Generate checksums for all items
- Clearly mark derived/enhanced copies
- Get proper approvals
- Document chain of custody
- Include complete manifest

❌ **Don't:**
- Mix original and modified without labels
- Skip approval workflow
- Create packages without checksums
- Approve your own packages (conflict of interest)

### 5. Authority Coordination

✅ **Do:**
- Record all communication
- Track GD/FIR numbers
- Log evidence transfers
- Keep receipt acknowledgments
- Follow up regularly
- Maintain separate records for police and insurance

❌ **Don't:**
- Share evidence without approval
- Skip transfer documentation
- Lose track of evidence location
- Miss follow-up deadlines

### 6. Confidentiality

✅ **Do:**
- Classify incidents appropriately (public/internal/confidential/restricted)
- Restrict access to sensitive incidents
- Use confidential notes for sensitive observations
- Redact personal information when sharing externally
- Separate personnel matters from operational incidents

❌ **Don't:**
- Discuss confidential incidents in public areas
- Grant blanket access to all incidents
- Include unnecessary personal details
- Share employee misconduct incidents widely

### 7. Corrective Actions

✅ **Do:**
- Identify root cause
- Document control failures
- Create specific, actionable tasks
- Assign owners and due dates
- Track completion
- Verify effectiveness

❌ **Don't:**
- Close incidents with incomplete actions
- Create vague tasks ("improve security")
- Leave tasks unassigned
- Skip follow-up verification

### 8. Reporting

✅ **Do:**
- Distinguish facts from conclusions
- Include complete evidence index
- Document unresolved questions
- Get management approval for final reports
- Archive reports with incident

❌ **Don't:**
- State assumptions as facts
- Omit contradictory evidence
- Rush final reports
- Skip management review

---

## Compliance Considerations

### RBI Guidelines for Banks

**Video retention:**
- Minimum 180 days for branch cameras
- Incidents extend retention via legal hold
- ATM cameras: 180 days minimum
- Critical incidents: Preserve until case closure

**Audit trail:**
- All evidence access must be logged
- Log includes: who, when, what, why
- Audit logs immutable (append-only)
- Retention: 7 years minimum

**Third-party access:**
- Explicit approval required
- Document sharing justification
- Time-limited access
- Log all downloads

### Data Protection & Privacy

**Personal data:**
- Minimize collection of personal information
- Restrict access based on role and need
- Participant names/contacts: confidential by default
- Employee misconduct: highly-restricted classification
- Redact personal info when sharing with authorities (unless legally required)

**Consent:**
- Signage informing CCTV recording
- Privacy policy available
- Employee awareness training

**Retention:**
- Incident records: 7 years
- Video evidence: Until case closure + statute of limitations
- Delete personal data when no longer required

### Chain of Custody

**Requirements:**
- Unbroken custody record from capture to presentation
- Document every transfer
- Maintain checksums
- Prevent tampering
- Secure storage

**Legal admissibility:**
- Original recordings preserved untouched
- Checksums prove integrity
- Complete access logs
- Enhancement operations documented
- Expert testimony may be required

### Evidence Handling Standards

**ISO 27037 Guidelines:**
- Identification - Locate potential evidence
- Collection - Preserve without alteration
- Acquisition - Create working copies with checksums
- Preservation - Maintain integrity and security
- Documentation - Complete audit trail

**Implementation in Aditi Sentinel:**
- ✅ Automatic SHA-256 checksums
- ✅ Legal hold prevents deletion
- ✅ Original + derived copy separation
- ✅ Complete chain of custody
- ✅ Access logging
- ✅ Time-stamped audit trail

### Compliance Checklist

**Before going live:**
- [ ] Define organizational incident types
- [ ] Configure retention periods per incident type
- [ ] Set up role-based permissions
- [ ] Define approval workflows
- [ ] Configure response time SLAs
- [ ] Train operators on triage
- [ ] Train investigators on evidence handling
- [ ] Train evidence officers on package creation
- [ ] Set up external sharing procedures
- [ ] Define police intimation process
- [ ] Configure insurance claim workflow
- [ ] Document procedures in operations manual
- [ ] Test evidence package creation
- [ ] Verify checksum validation
- [ ] Test secure sharing with mock authority
- [ ] Review with legal/compliance team

**Periodic reviews:**
- [ ] Quarterly permission audit
- [ ] Monthly incident classification review
- [ ] Quarterly evidence retention audit
- [ ] Annual procedure updates
- [ ] Staff training refreshers

---

## Troubleshooting Common Scenarios

### Scenario 1: Cannot Create Incident

**Symptoms:** API returns 403 Forbidden

**Causes:**
- Missing `incident:create` permission
- Scope restriction (user lacks access to branch)

**Resolution:**
1. Check user permissions: `GET /v1/users/:id/effective-permissions`
2. Verify scope grants include target branch
3. Request permission from administrator

### Scenario 2: Video Preservation Fails

**Symptoms:** Legal hold not applied, retention cleanup deletes evidence

**Causes:**
- Recording segments not found
- Incorrect time range
- Storage system unavailable

**Resolution:**
1. Verify camera was recording during incident time
2. Check segment existence: Query recording store
3. Manually apply legal hold to segments
4. Create incident video range record retroactively
5. Copy segments to Evidence Vault if available

### Scenario 3: Evidence Package Approval Blocked

**Symptoms:** Cannot approve package, error "creator cannot approve own package"

**Causes:**
- Separation of duties enforcement
- Package creator attempting self-approval

**Resolution:**
1. Assign approval to different user with `evidence:approve` permission
2. Typically: Evidence officer creates, senior manager approves
3. This is by design - enforce separation

### Scenario 4: Secure Share Link Not Working

**Symptoms:** Recipient cannot access evidence

**Causes:**
- Link expired
- OTP invalid
- Download limit exceeded
- Link revoked

**Resolution:**
1. Check share status: `GET /v1/incidents/:id/secure-shares`
2. Verify expiry date
3. Confirm download count < max downloads
4. Generate new secure share if expired
5. Provide new OTP

### Scenario 5: Incident Cannot Be Closed

**Symptoms:** API returns error when attempting to close

**Causes:**
- Mandatory tasks incomplete
- Required evidence packages not approved
- Police intimation incomplete (if required)

**Resolution:**
1. Check tasks: `GET /v1/incidents/:id/tasks`
2. Complete all mandatory tasks
3. Verify evidence packages approved
4. Update police/insurance records if required
5. Retry close operation

---

## Summary

The Incident Management & Investigation module provides a complete, audit-ready system for managing security incidents from detection through closure. Key capabilities include:

- **16-stage workflow** with clear statuses and SLAs
- **Automatic evidence preservation** with legal hold integration
- **Chain of custody** tracking for legal admissibility
- **Police and insurance coordination** workflows
- **Secure external sharing** with time-limited, OTP-protected access
- **Granular RBAC** with separation of duties
- **Complete audit trail** for compliance
- **Integration** with recording, alerts, and access control systems

By following this guide and best practices, organizations can ensure proper incident handling, evidence integrity, and regulatory compliance while maintaining operational efficiency.

---

## Additional Resources

- **Permissions Guide:** See `INCIDENT_PERMISSIONS_GUIDE.md` for detailed permission model
- **API Schemas:** See `src/routes/incidents.routes.ts` for validation schemas
- **Database Schema:** See `database/migrations/023_incident_management_comprehensive.sql`
- **Domain Models:** See `src/domain/models.ts` for TypeScript interfaces

For questions or issues, contact your system administrator or refer to the main Aditi Sentinel documentation.
