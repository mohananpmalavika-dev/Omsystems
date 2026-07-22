# Video Search, Playback & Forensic Evidence Module

**Module 2.5 of Aditi Sentinel CCTV Management System**

This module provides comprehensive video search, playback controls, and forensic evidence management capabilities for security investigations and legal compliance.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Search Features](#search-features)
3. [Playback Controls](#playback-controls)
4. [Forensic Evidence](#forensic-evidence)
5. [API Reference](#api-reference)
6. [Database Schema](#database-schema)
7. [Integration Guide](#integration-guide)
8. [Best Practices](#best-practices)

---

## Architecture Overview

### Component Structure

```
┌─────────────────────────────────────────────────┐
│           Dashboard UI Layer                    │
│  ┌──────────────┐  ┌──────────────┐            │
│  │ VideoSearch  │  │ Playback     │            │
│  │ Interface    │  │ Controller   │            │
│  └──────────────┘  └──────────────┘            │
└─────────────────────────────────────────────────┘
                     │
┌─────────────────────────────────────────────────┐
│           Control Plane API                     │
│  ┌──────────────────────────────────────┐      │
│  │ Video Search Routes                  │      │
│  │ Evidence Routes                      │      │
│  │ Export Routes                        │      │
│  └──────────────────────────────────────┘      │
└─────────────────────────────────────────────────┘
                     │
┌─────────────────────────────────────────────────┐
│           Business Logic Layer                  │
│  ┌──────────────┐  ┌──────────────┐            │
│  │ Search       │  │ Playback     │            │
│  │ Service      │  │ Engine       │            │
│  └──────────────┘  └──────────────┘            │
│  ┌──────────────┐  ┌──────────────┐            │
│  │ Snapshot     │  │ Export       │            │
│  │ Service      │  │ Worker       │            │
│  └──────────────┘  └──────────────┘            │
│  ┌──────────────┐                               │
│  │ Forensic     │                               │
│  │ Analyzer     │                               │
│  └──────────────┘                               │
└─────────────────────────────────────────────────┘
                     │
┌─────────────────────────────────────────────────┐
│           Data Layer                            │
│  ┌──────────────────────────────────────┐      │
│  │ Recording Segments                   │      │
│  │ Search Index                         │      │
│  │ Motion Events                        │      │
│  │ Detected Objects                     │      │
│  │ Forensic Export Jobs                 │      │
│  │ Evidence Manifests                   │      │
│  │ Chain of Custody                     │      │
│  └──────────────────────────────────────┘      │
└─────────────────────────────────────────────────┘
```

### Key Components

- **RecordingSearchService**: Comprehensive search with filters for date/time, camera, events, motion, and objects
- **PlaybackEngine**: Multi-camera synchronized playback with session tracking
- **SnapshotService**: Forensic snapshot capture with original preservation
- **ExportWorker**: Evidence export with original/viewing-copy modes and signed manifests
- **ForensicAnalyzer**: Timestamp verification, integrity checking, and tamper detection

---

## Search Features

### 1. Date and Time Search

Search recordings by selecting a time range:

```typescript
// API Request
GET /v1/recordings/search?cameraId=cam-001&from=2026-07-21T10:00:00Z&to=2026-07-21T11:00:00Z

// Response
{
  "segments": [...],
  "gaps": [
    {
      "startTime": "2026-07-21T10:14:32Z",
      "endTime": "2026-07-21T10:16:05Z",
      "reason": "Recording gap"
    }
  ],
  "timeline": [...],
  "events": [...],
  "coveragePercent": 94.5,
  "recordedSeconds": 3402,
  "requestedSeconds": 3600
}
```

**Features:**
- Branch and camera hierarchy filtering
- Recording gap detection
- Coverage percentage calculation
- Timeline visualization data
- Maximum 31-day search window

### 2. Camera Hierarchy Search

Search across the organizational hierarchy:

```
Company → Division → Region → Area → Branch → Camera Group → Camera
```

```typescript
// Search by branch
GET /v1/recordings/search?branchId=branch-kollam&from=...&to=...

// Search specific cameras
GET /v1/recordings/search?cameraIds[]=cam-001&cameraIds[]=cam-002&from=...&to=...
```

### 3. Event-Based Search

Filter recordings by event types:

```typescript
// Motion events
GET /v1/recordings/search?hasMotion=true&minDuration=10&from=...&to=...

// AI events
GET /v1/recordings/search?hasAIEvents=true&from=...&to=...

// Specific recording type
GET /v1/recordings/search?recordingType=motion&from=...&to=...
```

**Event Types:**
- Motion detection
- Person detected
- Vehicle detected
- Intrusion
- Line crossing
- Loitering
- Crowd threshold
- Fire/smoke
- Unattended object
- Camera tampering

### 4. Motion-Based Search

Search specifically for motion events:

```typescript
GET /v1/recordings/search/motion?cameraId=cam-001&from=...&to=...&minDuration=10&minConfidence=0.8

// Response
{
  "data": [
    {
      "id": "motion-001",
      "cameraId": "cam-001",
      "segmentId": "seg-001",
      "startedAt": "2026-07-21T10:42:18Z",
      "endedAt": "2026-07-21T10:42:43Z",
      "durationSeconds": 25,
      "confidence": 0.92,
      "motionAreaPercent": 15.3,
      "zoneName": "Entrance Zone"
    }
  ],
  "total": 145
}
```

### 5. Object Detection Search

Search for detected objects (person, vehicle, etc.):

```typescript
GET /v1/recordings/search/objects?cameraId=cam-001&objectClass=person&minConfidence=0.85&from=...&to=...

// Response
{
  "data": [
    {
      "id": "obj-001",
      "cameraId": "cam-001",
      "detectedAt": "2026-07-21T10:42:18Z",
      "objectClass": "person",
      "confidence": 0.91,
      "boundingBox": { "x": 100, "y": 200, "width": 50, "height": 120 },
      "attributes": { "color": "blue", "direction": "left-to-right" },
      "thumbnail": "/thumbnails/obj-001.jpg"
    }
  ],
  "total": 89
}
```

**Supported Object Classes:**
- Person
- Car
- Motorcycle
- Bus
- Truck
- Bicycle
- Bag
- Suitcase
- Package

### 6. Timeline Visualization

Get timeline data with events and markers:

```typescript
GET /v1/recordings/timeline?cameraId=cam-001&from=...&to=...

// Response
{
  "timeline": [
    { "startTime": "...", "endTime": "...", "type": "recording", "hasMotion": true },
    { "startTime": "...", "endTime": "...", "type": "gap" }
  ],
  "events": [
    {
      "id": "evt-001",
      "timestamp": "2026-07-21T10:42:18Z",
      "type": "motion",
      "severity": "info",
      "title": "Motion detected",
      "color": "#3B82F6"
    }
  ],
  "gaps": [...],
  "coveragePercent": 94.5
}
```

---

## Playback Controls

### 1. Standard Playback

Basic video playback with controls:

**Playback Speeds:**
- 0.25× (slow motion)
- 0.5×
- 1× (normal)
- 2×
- 4×
- 8×
- 16× (fast forward)

**Controls:**
- Play/Pause
- Seek
- Jump ±10 seconds
- Volume
- Fullscreen
- Digital zoom

### 2. Frame-by-Frame Analysis

Precise frame navigation for investigations:

```typescript
// Create playback session
POST /v1/recordings/playback/sessions
{
  "cameraId": "cam-001",
  "fromTime": "2026-07-21T10:00:00Z",
  "toTime": "2026-07-21T11:00:00Z",
  "evidenceCaseId": "case-001",
  "reason": "Investigation of incident INC-2026-00192"
}

// Frame navigation
- Previous Frame: ◀│
- Play/Pause: ▶
- Next Frame: │▶
```

**Frame Display:**
- Exact playback timestamp
- Frame number relative to clip
- Camera name
- Recording checksum status
- Original frame dimensions
- Codec information

### 3. Synchronized Multi-Camera Playback

View multiple cameras with synchronized timeline:

```typescript
POST /v1/recordings/playback/synchronized
{
  "cameraIds": ["cam-001", "cam-002", "cam-003", "cam-004"],
  "masterCameraId": "cam-001",
  "fromTime": "2026-07-21T10:00:00Z",
  "toTime": "2026-07-21T11:00:00Z",
  "layout": "grid"
}

// Response includes time offsets for each camera
{
  "groupId": "group-001",
  "cameras": [
    {
      "cameraId": "cam-001",
      "name": "Entrance",
      "segments": [...],
      "timeOffset": 0
    },
    {
      "cameraId": "cam-002",
      "name": "Cash Counter",
      "segments": [...],
      "timeOffset": 120  // 120ms adjustment
    }
  ],
  "masterCameraId": "cam-001",
  "layout": "grid"
}
```

**Features:**
- Master clock synchronization
- Time offset correction per camera
- Synchronized play/pause/seek
- Grid, stacked, or custom layouts
- Save playback groups for reuse

### 4. Playback Session Tracking

All playback sessions are logged for audit:

```typescript
// Session includes:
- User ID and source IP
- Camera and time range
- Evidence case reference (if applicable)
- Segments accessed
- Actions performed (snapshot, bookmark, export)
- Duration
```

---

## Forensic Evidence

### 1. Snapshot Capture

Capture forensic snapshots with preservation:

```typescript
POST /v1/recordings/snapshots
{
  "segmentId": "seg-001",
  "cameraId": "cam-001",
  "timestamp": "2026-07-21T10:42:18Z",
  "snapshotType": "forensic",
  "reason": "Evidence for investigation INC-2026-00192",
  "notes": "Suspect visible at entrance",
  "evidenceCaseId": "case-001"
}

// Snapshot includes:
- Original frame (untouched)
- Annotated copy (optional, with timestamp/camera overlay)
- SHA-256 hash of original
- Dimensions and format
- Camera metadata
- Segment reference
```

**Snapshot Types:**
- `manual`: User-initiated
- `automatic`: System-generated
- `forensic`: Legal evidence
- `investigation`: Internal review

### 2. Bookmarks

Create timestamped bookmarks:

```typescript
POST /v1/recordings/bookmarks
{
  "cameraId": "cam-001",
  "timestamp": "2026-07-21T10:42:18Z",
  "reason": "suspicious-activity",
  "priority": "high",
  "notes": "Person loitering near entrance",
  "tags": ["investigation", "high-priority"],
  "evidenceCaseId": "case-001",
  "incidentId": "inc-001"
}
```

**Bookmark Features:**
- Priority levels (low, medium, high, critical)
- Custom tags for organization
- Link to evidence cases and incidents
- Verification workflow
- Recording segment reference

### 3. Evidence Export

Export recordings as legal evidence:

```typescript
POST /v1/evidence/exports
{
  "caseId": "case-001",
  "exportType": "viewing-copy",
  "format": "mp4",
  "cameras": [
    {
      "cameraId": "cam-001",
      "fromTime": "2026-07-21T10:00:00Z",
      "toTime": "2026-07-21T11:00:00Z"
    }
  ],
  "options": {
    "watermark": true,
    "timestampOverlay": true,
    "audioIncluded": true,
    "quality": "high"
  },
  "reason": "Legal proceedings case #2026-LAW-0042",
  "priority": 1
}
```

**Export Types:**
- **Original**: Untranscoded segments (forensic verification)
- **Viewing Copy**: MP4 with watermark/overlay (court presentation)
- **Multi-Camera**: Synchronized export from multiple cameras
- **Investigation Package**: Complete bundle with manifest and metadata

**Export Options:**
- Watermark application
- Timestamp overlay
- Audio inclusion/exclusion
- Password protection
- Quality selection

### 4. Signed Export Manifest

Every export includes a digitally signed manifest:

```json
{
  "id": "manifest-001",
  "version": "v1.0",
  "caseId": "case-001",
  "caseNumber": "CASE-2026-00042",
  "exportedBy": "investigator@example.com",
  "exportedAt": "2026-07-21T12:00:00Z",
  "sourceSegments": [
    {
      "segmentId": "seg-001",
      "cameraId": "cam-001",
      "cameraName": "Vault Entrance",
      "startTime": "2026-07-21T10:00:00Z",
      "endTime": "2026-07-21T10:01:00Z",
      "sha256": "a1b2c3d4...",
      "storagePath": "recordings/2026/07/21/10/cam-001-1000.mp4"
    }
  ],
  "destinationFile": {
    "format": "mp4",
    "sha256": "e5f6g7h8...",
    "fileSize": 125829120,
    "codec": "h264",
    "resolution": "1920x1080"
  },
  "timestamp": {
    "cameraTime": "2026-07-21T10:00:00+05:30",
    "recorderTime": "2026-07-21T04:30:00Z",
    "clockOffset": 1.3,
    "ntpStatus": "synchronized",
    "timezone": "Asia/Kolkata"
  },
  "exportChain": [
    {
      "step": "segments_collected",
      "timestamp": "2026-07-21T11:58:00Z",
      "details": { "count": 60 }
    },
    {
      "step": "transcoded_to_mp4",
      "timestamp": "2026-07-21T11:59:30Z",
      "details": { "codec": "h264", "watermark": true }
    }
  ],
  "watermarkApplied": true,
  "passwordProtected": false,
  "digitalSignature": "3a4b5c6d...",
  "signingKeyId": "system-key-01",
  "signedAt": "2026-07-21T12:00:00Z"
}
```

### 5. Timestamp Verification

Verify timestamp authenticity:

```typescript
// Verification includes:
- Camera timestamp
- Recorder timestamp
- Control plane receipt time
- Clock offset measurement
- NTP synchronization status
- Timezone information
- Confidence level (high/medium/low)

// Example result:
{
  "status": "verified",
  "cameraTimestamp": "2026-07-21T10:42:18+05:30",
  "recorderTimestamp": "2026-07-21T05:12:18Z",
  "clockOffsetMs": 1300,
  "ntpStatus": "synchronized",
  "confidence": "high",
  "issues": []
}
```

### 6. Integrity Verification

Verify recording integrity with hash comparison:

```typescript
// Hash verification:
- Stored SHA-256 hash (from recording time)
- Computed SHA-256 hash (verification time)
- File existence check
- File size match
- Status: verified | mismatch | missing | corrupted
```

### 7. Chain of Custody

Immutable audit trail for evidence:

```typescript
// Every custody event records:
- Action (created, viewed, exported, verified, etc.)
- Performed by (user ID)
- Timestamp
- Reason
- Source IP
- Event hash (SHA-256)
- Previous event hash (creates hash chain)

// Hash chain prevents:
- Event deletion
- Event reordering
- Event tampering
```

**Custody Actions:**
- `recording_created`
- `snapshot_captured`
- `bookmark_created`
- `viewed`
- `export_requested`
- `export_approved`
- `export_generated`
- `export_downloaded`
- `verified`
- `legal_hold_applied`
- `hold_released`

### 8. Tamper Detection

Automated tamper analysis:

```typescript
// Checks for:
- Hash mismatches (critical)
- Chain of custody breaks (critical)
- Timestamp anomalies (high)
- Metadata inconsistencies (medium)
- File modifications (high)

// Example result:
{
  "tampered": false,
  "confidence": 0.95,
  "indicators": [],
  "recommendation": "No evidence of tampering detected"
}
```

---

## API Reference

### Search Endpoints

```
GET  /v1/recordings/search              # Comprehensive search
GET  /v1/recordings/timeline            # Timeline with events
GET  /v1/recordings/search/motion       # Motion event search
GET  /v1/recordings/search/objects      # Object detection search
GET  /v1/recordings/search/object-classes  # Available object types
GET  /v1/recordings/statistics          # Recording statistics
```

### Playback Endpoints

```
POST /v1/recordings/playback/sessions           # Create session
POST /v1/recordings/playback/sessions/:id/end   # End session
POST /v1/recordings/playback/synchronized       # Multi-camera playback
GET  /v1/recordings/playback/groups             # List playback groups
POST /v1/recordings/playback/groups             # Save playback group
```

### Snapshot & Bookmark Endpoints

```
POST /v1/recordings/snapshots              # Create snapshot
GET  /v1/recordings/snapshots              # List snapshots
GET  /v1/recordings/snapshots/:id          # Get snapshot
POST /v1/recordings/bookmarks              # Create bookmark
GET  /v1/recordings/bookmarks              # List bookmarks
POST /v1/recordings/bookmarks/:id/verify   # Verify bookmark
```

### Evidence Export Endpoints

```
POST /v1/evidence/exports                      # Request export
GET  /v1/evidence/exports/:id/status           # Export status
GET  /v1/evidence/exports/:id/download         # Download export
GET  /v1/evidence/exports/:id/manifest         # Get manifest
```

---

## Database Schema

### Core Tables

**recording_search_index**
- Pre-computed search metadata
- Fast query performance
- Automatically updated via triggers

**motion_events**
- Motion detection metadata
- Zone and confidence tracking
- Duration and region data

**detected_objects**
- AI detection results
- Object class and confidence
- Bounding boxes and attributes

**forensic_export_jobs**
- Export request tracking
- Processing status and progress
- Download token management

**export_verification_log**
- Verification audit trail
- Integrity check results

**playback_sessions**
- User viewing audit
- Segment access tracking
- Action logging

**chain_of_custody_events**
- Immutable custody trail
- Hash-linked event chain
- Tamper-evident logging

---

## Integration Guide

### 1. Initialize Services

```typescript
import { Pool } from "pg";
import { RecordingSearchService } from "./recording/search-service.js";
import { PlaybackEngine } from "./recording/playback-engine.js";
import { SnapshotService } from "./recording/snapshot-service.js";
import { ExportWorker } from "./recording/export-worker.js";
import { ForensicAnalyzer } from "./recording/forensic-analyzer.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const searchService = new RecordingSearchService(pool);
const playbackEngine = new PlaybackEngine(pool);
const snapshotService = new SnapshotService(pool);
const exportWorker = new ExportWorker(pool);
const forensicAnalyzer = new ForensicAnalyzer(pool, "/path/to/recordings");
```

### 2. Register Routes

```typescript
import { registerVideoSearchRoutes } from "./routes/video-search.routes.js";

await registerVideoSearchRoutes(app, {
  searchService,
  playbackEngine,
  snapshotService,
});
```

### 3. Background Export Worker

```typescript
// Start export job processor
setInterval(async () => {
  // Fetch pending jobs
  const jobs = await pool.query(
    `SELECT id FROM forensic_export_jobs 
     WHERE status IN ('pending', 'queued') 
     ORDER BY priority DESC, created_at ASC 
     LIMIT 1`
  );
  
  for (const job of jobs.rows) {
    await exportWorker.processExport(job.id);
  }
}, 10000); // Every 10 seconds
```

---

## Best Practices

### Search Optimization

1. **Use appropriate time ranges**: Limit searches to 31 days or less
2. **Filter by camera first**: Reduces dataset size significantly
3. **Index regularly**: Ensure search index is up-to-date
4. **Cache timeline data**: Timeline generation can be expensive

### Forensic Evidence Handling

1. **Always create snapshots for investigations**: Don't rely on segment alone
2. **Document every export**: Include detailed reason and case reference
3. **Verify integrity before court**: Run verification report before legal proceedings
4. **Preserve original segments**: Never modify original recordings
5. **Use legal holds liberally**: Better safe than sorry with retention

### Performance Considerations

1. **Limit simultaneous exports**: Queue and process sequentially
2. **Use viewing copies for review**: Save bandwidth and storage
3. **Pre-generate thumbnails**: Don't generate on-demand during search
4. **Archive old recordings**: Move to cold storage after hot retention period

### Security & Compliance

1. **Require justification for legal hold footage**: Log all access
2. **Implement download limits**: Prevent unauthorized distribution
3. **Use token expiry**: Downloads should expire after 7 days
4. **Audit everything**: Chain of custody is critical for legal validity
5. **Enable NTP on all cameras**: Timestamp accuracy is essential

---

## Troubleshooting

### Search Returns No Results

**Check:**
1. Recording segments exist in time range
2. Search index is populated (check `recording_search_index` table)
3. Camera permissions are correct
4. Segments have `status = 'ready'`

### Export Fails

**Common causes:**
1. Segment files missing from storage
2. Insufficient disk space for export
3. FFmpeg not available for transcoding
4. Permission denied on storage path

### Integrity Verification Fails

**Possible reasons:**
1. File was moved or modified after recording
2. Storage corruption
3. Incorrect hash algorithm
4. File deleted but index not updated

### Timestamp Verification Warning

**Resolution:**
1. Enable NTP on cameras
2. Verify NTP server is reachable
3. Check clock offset magnitude
4. Document in investigation if offset is acceptable

---

## Support & Resources

- **Database Migrations**: `database/migrations/021_video_search_forensic.sql`
- **Service Implementations**: `src/recording/`
- **API Routes**: `src/routes/video-search.routes.ts`, `src/routes/evidence.routes.ts`
- **UI Components**: `dashboard/components/` (to be implemented)

For questions or issues, refer to the main Aditi Sentinel documentation or contact the development team.

---

**Version**: 1.0  
**Last Updated**: July 2026  
**Module Status**: Implementation Complete (Backend), UI In Progress
