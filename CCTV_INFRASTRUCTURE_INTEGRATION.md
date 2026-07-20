# CCTV Infrastructure Integration

## Overview

This document describes the comprehensive CCTV infrastructure integration added to the Sentinel Grid platform. The integration provides detailed camera specifications, installation tracking, compliance monitoring, and location-based requirements management for banking and financial institutions.

---

## Features Added

### 1. **Enhanced Camera Specifications**

Each camera can now track detailed technical specifications:

- **Video Specifications**: Resolution (MP, width, height), frame rate, codec, bitrate
- **Optical Specifications**: Field of view, focal length, lens type
- **Night Vision**: IR capability, IR distance, WDR
- **Environmental**: Weatherproof rating (IP20-IP68), operating temperature range, vandal resistance
- **Power**: Consumption, supply type, PoE class
- **Storage**: Retention days, average storage per day
- **Advanced Features**: Two-way audio, motion detection, analytics capabilities

### 2. **Installation Location Types**

Standardized camera location categories for banking environments:

- Branch entrance/exit
- Cash counter/teller area
- Manager cabin
- Strong room/vault
- Locker room/safe deposit
- ATM cabin
- Parking area
- Perimeter fencing
- Staircase/corridors
- Server room
- Lobby

### 3. **Physical Camera Types**

Classification of camera form factors:

- Dome (indoor/outdoor)
- Bullet (indoor/outdoor)
- PTZ (Pan-Tilt-Zoom)
- Fixed
- Thermal
- License Plate Recognition (LPR)
- Panoramic
- Fisheye

### 4. **Compliance Tracking**

Monitors installation compliance with:

- Resolution requirements
- Frame rate requirements
- Coverage requirements
- Retention requirements
- Lighting and angle standards
- Audio recording compliance
- Privacy mask configuration
- Warning signage installation
- Regular inspection scheduling

### 5. **Branch Requirements Management**

Define required camera coverage per branch:

- Set minimum camera counts per location type
- Specify technical requirements (resolution, frame rate, night vision, etc.)
- Track actual vs. required camera deployment
- Priority levels (1-5)
- Regulatory compliance flags
- Coverage gap reporting

---

## Database Schema

### New Tables

#### `camera_specifications`
Stores detailed technical specifications for each camera.

```sql
CREATE TABLE camera_specifications (
  id uuid PRIMARY KEY,
  camera_id uuid UNIQUE REFERENCES cameras(id),
  resolution_mp numeric(4,2) NOT NULL,
  resolution_width integer NOT NULL,
  resolution_height integer NOT NULL,
  frame_rate integer NOT NULL DEFAULT 25,
  video_codec video_codec NOT NULL DEFAULT 'H264',
  -- ... many more fields
);
```

#### `camera_installation_compliance`
Tracks compliance status and inspection schedule.

```sql
CREATE TABLE camera_installation_compliance (
  id uuid PRIMARY KEY,
  camera_id uuid REFERENCES cameras(id),
  meets_resolution_requirement boolean,
  meets_frame_rate_requirement boolean,
  meets_coverage_requirement boolean,
  meets_retention_requirement boolean,
  last_inspection_date date,
  next_inspection_date date,
  -- ... compliance checks
);
```

#### `branch_camera_requirements`
Defines required camera coverage per location type per branch.

```sql
CREATE TABLE branch_camera_requirements (
  id uuid PRIMARY KEY,
  branch_node_id uuid REFERENCES resource_nodes(id),
  location_type camera_location_type NOT NULL,
  required_count integer NOT NULL DEFAULT 1,
  actual_count integer NOT NULL DEFAULT 0,
  min_resolution_mp numeric(4,2) NOT NULL DEFAULT 2.0,
  min_frame_rate integer NOT NULL DEFAULT 25,
  requires_night_vision boolean,
  -- ... requirements
  UNIQUE (branch_node_id, location_type)
);
```

### New Views

#### `branch_camera_coverage_gaps`
Shows locations where actual camera count is below requirements.

#### `camera_compliance_summary`
Consolidated view of camera specifications and compliance status.

### New Types

- `camera_location_type` - Standardized location categories
- `physical_camera_type` - Camera form factors
- `weatherproof_rating` - IP rating standards (IP20-IP68)
- `video_codec` - Supported video codecs (H264, H265, H265+, etc.)

### Triggers

**`maintain_branch_camera_count`**: Automatically updates `actual_count` in `branch_camera_requirements` when cameras are added, removed, or relocated.

---

## API Endpoints

### Camera Specifications

#### Get Camera Specifications
```http
GET /v1/cameras/:id/specifications
Authorization: x-user-id: <user-id>
```

**Response:**
```json
{
  "id": "spec-uuid",
  "cameraId": "camera-uuid",
  "resolutionMp": 2.0,
  "resolutionWidth": 1920,
  "resolutionHeight": 1080,
  "frameRate": 25,
  "videoCodec": "H264",
  "hasNightVision": true,
  "irDistanceMeters": 30,
  "weatherproofRating": "IP66",
  "storageDays": 90,
  ...
}
```

#### Create/Update Camera Specifications
```http
PUT /v1/cameras/:id/specifications
Content-Type: application/json
Authorization: x-user-id: <user-id>

{
  "resolutionMp": 2.0,
  "resolutionWidth": 1920,
  "resolutionHeight": 1080,
  "frameRate": 30,
  "videoCodec": "H265",
  "hasNightVision": true,
  "irDistanceMeters": 30,
  "hasWdr": true,
  "weatherproofRating": "IP66",
  "vandalResistant": true,
  "storageDays": 90,
  "hasTwoWayAudio": false,
  "hasMotionDetection": true,
  "hasAnalytics": true,
  "analyticsFeatures": ["line-crossing", "intrusion-detection"]
}
```

### Camera Compliance

#### Get Camera Compliance Status
```http
GET /v1/cameras/:id/compliance
Authorization: x-user-id: <user-id>
```

#### Update Camera Compliance
```http
PUT /v1/cameras/:id/compliance
Content-Type: application/json
Authorization: x-user-id: <user-id>

{
  "meetsResolutionRequirement": true,
  "meetsFrameRateRequirement": true,
  "meetsCoverageRequirement": true,
  "meetsRetentionRequirement": true,
  "properLighting": true,
  "properAngle": true,
  "complianceNotes": "Installation verified, all requirements met",
  "lastInspectionDate": "2026-07-15",
  "nextInspectionDate": "2026-10-15",
  "inspectorName": "John Smith",
  "audioRecordingCompliant": true,
  "privacyMaskConfigured": false,
  "signageInstalled": true
}
```

### Camera Installation Details

#### Update Camera Details
```http
PATCH /v1/cameras/:id/details
Content-Type: application/json
Authorization: x-user-id: <user-id>

{
  "locationType": "cash-counter",
  "physicalType": "dome-indoor",
  "installationDate": "2026-06-01",
  "warrantyExpiresAt": "2029-06-01",
  "serialNumber": "HIK-12345678",
  "macAddress": "00:11:22:33:44:55",
  "firmwareVersion": "V5.7.3",
  "ipAddress": "192.168.1.101",
  "installationNotes": "Mounted at 3.2m height, covering counter area"
}
```

### Branch Requirements

#### Get Branch Camera Requirements
```http
GET /v1/branches/:branchId/camera-requirements
Authorization: x-user-id: <user-id>
```

**Response:**
```json
{
  "data": [
    {
      "id": "req-uuid",
      "branchNodeId": "branch-uuid",
      "locationType": "cash-counter",
      "requiredCount": 2,
      "actualCount": 2,
      "minResolutionMp": 2.0,
      "minFrameRate": 30,
      "requiresNightVision": false,
      "requiresAudio": true,
      "requiresPtz": true,
      "requiresLpr": false,
      "priority": 1,
      "isRegulatoryRequirement": true,
      "complianceStandard": "Banking Security Standards 2024"
    },
    ...
  ]
}
```

#### Create/Update Branch Requirement
```http
PUT /v1/branches/:branchId/camera-requirements
Content-Type: application/json
Authorization: x-user-id: <user-id>

{
  "locationType": "atm-cabin",
  "requiredCount": 1,
  "minResolutionMp": 2.0,
  "minFrameRate": 25,
  "requiresNightVision": true,
  "requiresAudio": false,
  "requiresPtz": false,
  "requiresLpr": false,
  "priority": 2,
  "isRegulatoryRequirement": true,
  "complianceStandard": "ATM Security Guidelines 2024",
  "notes": "WDR required for varying lighting conditions"
}
```

#### Initialize Standard Requirements
```http
POST /v1/branches/:branchId/camera-requirements/initialize
Authorization: x-user-id: <user-id>
```

Populates standard camera requirements for all location types based on banking security best practices.

### Coverage and Compliance Reports

#### Get Branch Coverage Gaps
```http
GET /v1/branches/:branchId/coverage-gaps
Authorization: x-user-id: <user-id>
```

**Response:**
```json
{
  "data": [
    {
      "branchNodeId": "branch-uuid",
      "branchName": "Downtown Branch",
      "locationType": "parking-area",
      "requiredCount": 2,
      "actualCount": 0,
      "gapCount": 2,
      "priority": 4,
      "isRegulatoryRequirement": false
    }
  ]
}
```

#### Get Branch Compliance Summary
```http
GET /v1/branches/:branchId/compliance-summary
Authorization: x-user-id: <user-id>
```

**Response:**
```json
{
  "data": [
    {
      "cameraId": "camera-uuid",
      "cameraName": "Entrance Cam 1",
      "branchName": "Downtown Branch",
      "locationType": "branch-entrance",
      "physicalType": "bullet-outdoor",
      "status": "online",
      "resolutionMp": 2.0,
      "frameRate": 30,
      "hasNightVision": true,
      "weatherproofRating": "IP66",
      "meetsResolutionRequirement": true,
      "meetsFrameRateRequirement": true,
      "meetsCoverageRequirement": true,
      "meetsRetentionRequirement": true,
      "lastInspectionDate": "2026-07-01",
      "nextInspectionDate": "2026-10-01",
      "complianceStatus": "compliant"
    }
  ]
}
```

#### Get Cameras Due for Inspection
```http
GET /v1/inspections/due?days=30
Authorization: x-user-id: <user-id>
```

Returns all cameras with inspections due within the specified number of days.

---

## TypeScript Models

Updated models in `src/domain/models.ts`:

```typescript
export type CameraLocationType =
  | "branch-entrance"
  | "branch-exit"
  | "cash-counter"
  | "manager-cabin"
  | "strong-room"
  | "vault"
  | "locker-room"
  | "atm-cabin"
  | "parking-area"
  | "perimeter-fence"
  | "staircase"
  | "corridor"
  | "server-room"
  | "lobby"
  | "teller-area"
  | "safe-deposit"
  | "other";

export type PhysicalCameraType =
  | "dome-indoor"
  | "dome-outdoor"
  | "bullet-indoor"
  | "bullet-outdoor"
  | "ptz"
  | "fixed"
  | "thermal"
  | "license-plate-recognition"
  | "panoramic"
  | "fisheye";

export type WeatherproofRating =
  | "IP20" | "IP33" | "IP44" | "IP54" 
  | "IP65" | "IP66" | "IP67" | "IP68";

export interface Camera {
  // ... existing fields
  locationType?: CameraLocationType;
  physicalType?: PhysicalCameraType;
  installationDate?: string;
  warrantyExpiresAt?: string;
  serialNumber?: string;
  macAddress?: string;
  firmwareVersion?: string;
  ipAddress?: string;
  installationNotes?: string;
  specifications?: CameraSpecifications;
  compliance?: CameraInstallationCompliance;
}

export interface CameraSpecifications {
  id: string;
  cameraId: string;
  resolutionMp: number;
  resolutionWidth: number;
  resolutionHeight: number;
  frameRate: number;
  videoCodec: VideoCodec;
  // ... many more fields
}

export interface CameraInstallationCompliance {
  id: string;
  cameraId: string;
  meetsResolutionRequirement: boolean;
  meetsFrameRateRequirement: boolean;
  meetsCoverageRequirement: boolean;
  meetsRetentionRequirement: boolean;
  // ... compliance fields
}

export interface BranchCameraRequirement {
  id: string;
  branchNodeId: string;
  locationType: CameraLocationType;
  requiredCount: number;
  actualCount: number;
  minResolutionMp: number;
  minFrameRate: number;
  // ... requirement fields
}

export interface BranchCameraCoverageGap {
  branchNodeId: string;
  branchName: string;
  locationType: CameraLocationType;
  requiredCount: number;
  actualCount: number;
  gapCount: number;
  priority: number;
  isRegulatoryRequirement: boolean;
}

export interface CameraComplianceSummary {
  cameraId: string;
  cameraName: string;
  branchName: string;
  locationType?: CameraLocationType;
  physicalType?: PhysicalCameraType;
  status: CameraStatus;
  // ... specification and compliance fields
  complianceStatus: "compliant" | "non-compliant";
}
```

---

## Implementation Guide

### 1. Run Database Migrations

```bash
# Apply the CCTV infrastructure schema
psql $DATABASE_URL < database/migrations/004_cctv_infrastructure.sql

# Optional: Load standard requirements seed data
psql $DATABASE_URL < database/migrations/005_cctv_infrastructure_seed.sql
```

### 2. Implement Store Methods

Update your database store implementation (e.g., `src/database/pg-store.ts`) to implement the new methods defined in `ControlPlaneStore`:

- `getCameraSpecifications()`
- `upsertCameraSpecifications()`
- `getCameraCompliance()`
- `upsertCameraCompliance()`
- `updateCameraDetails()`
- `getBranchCameraRequirements()`
- `upsertBranchCameraRequirement()`
- `initializeBranchCameraRequirements()`
- `getBranchCoverageGaps()`
- `getBranchComplianceSummary()`
- `getCamerasDueForInspection()`

### 3. Register Routes

In your main `app.ts`, register the CCTV infrastructure routes:

```typescript
import { registerCctvInfrastructureRoutes } from "./routes/cctv-infrastructure.js";

// After building the app
await registerCctvInfrastructureRoutes(app, store);
```

### 4. Initialize Branch Requirements

For each new branch, initialize standard requirements:

```bash
curl -X POST http://localhost:8080/v1/branches/{branchId}/camera-requirements/initialize \
  -H "x-user-id: user-global-admin"
```

Or use the helper function in SQL:

```sql
SELECT populate_branch_camera_requirements('<branch-uuid>');
```

### 5. Update Camera Workflow

When approving a discovered camera:

1. **Approve the camera** (existing workflow)
2. **Set installation details**:
   ```bash
   curl -X PATCH http://localhost:8080/v1/cameras/{id}/details \
     -H "Content-Type: application/json" \
     -H "x-user-id: user-global-admin" \
     -d '{
       "locationType": "cash-counter",
       "physicalType": "dome-indoor",
       "installationDate": "2026-07-01"
     }'
   ```
3. **Add specifications**:
   ```bash
   curl -X PUT http://localhost:8080/v1/cameras/{id}/specifications \
     -H "Content-Type: application/json" \
     -H "x-user-id: user-global-admin" \
     -d '{
       "resolutionMp": 2.0,
       "resolutionWidth": 1920,
       "resolutionHeight": 1080,
       "frameRate": 30,
       "videoCodec": "H265",
       "hasNightVision": true,
       "irDistanceMeters": 30,
       "storageDays": 90
     }'
   ```
4. **Record compliance**:
   ```bash
   curl -X PUT http://localhost:8080/v1/cameras/{id}/compliance \
     -H "Content-Type: application/json" \
     -H "x-user-id: user-global-admin" \
     -d '{
       "meetsResolutionRequirement": true,
       "meetsFrameRateRequirement": true,
       "meetsCoverageRequirement": true,
       "meetsRetentionRequirement": true,
       "properLighting": true,
       "properAngle": true,
       "nextInspectionDate": "2026-10-01",
       "signageInstalled": true
     }'
   ```

---

## Use Cases

### Scenario 1: New Branch Setup

1. Create branch in hierarchy
2. Initialize standard camera requirements
3. Review requirements and adjust based on branch size/type
4. Install cameras according to requirements
5. Configure each camera with location, type, and specifications
6. Verify compliance for each installation
7. Monitor coverage gaps until all requirements met

### Scenario 2: Compliance Audit

1. Query branch compliance summary
2. Identify non-compliant cameras
3. Review specific compliance issues (resolution, angle, lighting, etc.)
4. Schedule inspections for cameras due
5. Export compliance report for regulatory submission

### Scenario 3: Coverage Gap Analysis

1. Query coverage gaps across all branches
2. Filter by priority or regulatory requirements
3. Plan camera procurement and installation
4. Track installation progress
5. Re-verify coverage after installation

### Scenario 4: Maintenance Scheduling

1. Query cameras due for inspection
2. Schedule maintenance visits
3. Perform inspection and update compliance record
4. Set next inspection date
5. Generate maintenance reports

---

## Standards Reference

Detailed CCTV infrastructure standards are documented in:

**[docs/cctv-infrastructure-standards.md](docs/cctv-infrastructure-standards.md)**

This comprehensive guide covers:

- Camera installation locations and priorities
- Camera types and specifications
- Minimum technical requirements
- Storage requirements and calculations
- Installation standards and best practices
- Compliance and regulatory requirements
- Vendor recommendations
- Network requirements
- Implementation checklists
- Maintenance schedules

---

## Security Considerations

### Access Control

- **Specifications**: Require `device:configure` permission
- **Compliance Updates**: Require `device:configure` permission
- **Viewing Reports**: Require `audit:view` permission for compliance summaries
- **Branch Requirements**: Require `device:configure` to modify, `live:view` to read

### Data Privacy

- Camera IP addresses and MAC addresses are sensitive
- Serial numbers and firmware versions aid in security patching
- Compliance records may contain inspector personal information
- Access to compliance reports should be restricted to authorized personnel

### Audit Trail

All CCTV infrastructure changes are audited:
- `camera.specifications_updated`
- `camera.compliance_updated`
- `camera.details_updated`
- `branch.camera_requirement_updated`
- `branch.camera_requirements_initialized`

---

## Dashboard Integration

To integrate into the operations dashboard:

1. **Branch View**: Show coverage status and compliance summary
2. **Camera Tile**: Display location type, physical type, compliance status
3. **Compliance Dashboard**: Real-time compliance metrics
4. **Coverage Map**: Visual representation of camera placement
5. **Inspection Calendar**: Upcoming inspection schedule
6. **Gap Report**: Priority-sorted coverage gaps

Example dashboard widget:

```typescript
interface BranchComplianceWidget {
  totalCameras: number;
  compliantCameras: number;
  nonCompliantCameras: number;
  coverageGaps: number;
  inspectionsDue: number;
  compliancePercentage: number;
}
```

---

## Performance Considerations

### Indexing

The migration includes indexes for:
- Camera specifications lookup
- Compliance inspection dates
- Branch requirements by location type
- Coverage gap queries

### Views

Pre-computed views for:
- Branch coverage gaps
- Camera compliance summary

These views simplify complex queries and improve dashboard performance.

### Caching

Consider caching:
- Branch requirements (change infrequently)
- Compliance summaries (refresh hourly)
- Coverage gaps (refresh on camera changes)

---

## Future Enhancements

1. **Automated Compliance Checks**: Validate camera settings against requirements
2. **Analytics Integration**: Track coverage effectiveness metrics
3. **Heatmap Visualization**: Show camera coverage density
4. **Mobile Inspection App**: Field technician tools for compliance updates
5. **AI-Powered Coverage Analysis**: Recommend optimal camera placement
6. **Integration with Physical Security**: Door access, alarm systems
7. **Predictive Maintenance**: Failure prediction based on usage patterns
8. **Cost Tracking**: Camera purchase, installation, and maintenance costs

---

## Testing

### Unit Tests

Test the new store methods:

```typescript
describe("CCTV Infrastructure", () => {
  it("should create camera specifications", async () => {
    const specs = await store.upsertCameraSpecifications(cameraId, {
      resolutionMp: 2.0,
      resolutionWidth: 1920,
      resolutionHeight: 1080,
      frameRate: 30,
      videoCodec: "H265",
      hasNightVision: true,
      storageDays: 90,
      // ...
    });
    expect(specs.cameraId).toBe(cameraId);
  });

  it("should track coverage gaps", async () => {
    const gaps = await store.getBranchCoverageGaps(branchId);
    expect(gaps.some(g => g.gapCount > 0)).toBe(true);
  });

  it("should maintain actual camera counts", async () => {
    // Create camera with location
    await store.updateCameraDetails(cameraId, {
      locationType: "cash-counter",
    });
    
    // Verify actual count increased
    const requirements = await store.getBranchCameraRequirements(branchId);
    const cashCounterReq = requirements.find(r => r.locationType === "cash-counter");
    expect(cashCounterReq.actualCount).toBeGreaterThan(0);
  });
});
```

### Integration Tests

Test the API endpoints:

```bash
# Test specification creation
npm test -- --grep "POST /v1/cameras/:id/specifications"

# Test compliance tracking
npm test -- --grep "PUT /v1/cameras/:id/compliance"

# Test coverage gap reporting
npm test -- --grep "GET /v1/branches/:branchId/coverage-gaps"
```

---

## Documentation

- **API Documentation**: All endpoints documented with examples
- **Standards Guide**: Comprehensive CCTV infrastructure standards
- **Database Schema**: Detailed table and view documentation
- **Migration Guide**: Step-by-step implementation instructions
- **Use Cases**: Real-world scenarios and workflows

---

## Support

For questions or issues:

1. Review the [CCTV Infrastructure Standards](docs/cctv-infrastructure-standards.md)
2. Check API endpoint examples in this document
3. Review database schema in `database/migrations/004_cctv_infrastructure.sql`
4. Consult the main [README](README.md) for general platform documentation

---

## Version History

- **v1.0** (2026-07-21): Initial CCTV infrastructure integration
  - Camera specifications tracking
  - Installation location types
  - Physical camera types
  - Compliance monitoring
  - Branch requirements management
  - Coverage gap reporting
  - Inspection scheduling

---

**Document Version**: 1.0  
**Last Updated**: 2026-07-21  
**Author**: Sentinel Grid Platform Team
