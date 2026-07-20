# CCTV Infrastructure Quick Reference

## 📋 Quick Access

- **Full Integration Guide**: [CCTV_INFRASTRUCTURE_INTEGRATION.md](CCTV_INFRASTRUCTURE_INTEGRATION.md)
- **Implementation Summary**: [CCTV_IMPLEMENTATION_SUMMARY.md](CCTV_IMPLEMENTATION_SUMMARY.md)
- **Standards Guide**: [docs/cctv-infrastructure-standards.md](docs/cctv-infrastructure-standards.md)

---

## 🎯 Location Types (13 Standard Types)

### Priority 1 (Critical - Regulatory)
- `branch-entrance` - Branch entrance
- `branch-exit` - Branch exit
- `cash-counter` - Cash counter/teller area
- `strong-room` - Strong room/vault
- `atm-cabin` - ATM cabin

### Priority 2-3 (Important)
- `manager-cabin` - Manager cabin
- `locker-room` - Locker room/safe deposit
- `server-room` - Server room

### Priority 4-5 (Standard)
- `parking-area` - Parking area
- `perimeter-fence` - Perimeter fencing
- `staircase` - Staircase
- `corridor` - Corridors
- `lobby` - Lobby/customer waiting area

---

## 📹 Physical Camera Types (10 Types)

- `dome-indoor` - Indoor dome camera
- `dome-outdoor` - Outdoor dome camera
- `bullet-indoor` - Indoor bullet camera
- `bullet-outdoor` - Outdoor bullet camera
- `ptz` - Pan-Tilt-Zoom camera
- `fixed` - Fixed camera
- `thermal` - Thermal imaging camera
- `license-plate-recognition` - LPR camera
- `panoramic` - Panoramic camera
- `fisheye` - Fisheye camera

---

## 🌡️ Weatherproof Ratings

- `IP20` - Indoor only
- `IP33` - Light splash protection
- `IP44` - Splash resistant
- `IP54` - Dust protected, splash resistant
- `IP65` - Dust tight, water jets
- `IP66` - Dust tight, powerful water jets (recommended outdoor)
- `IP67` - Dust tight, temporary immersion
- `IP68` - Dust tight, continuous immersion

---

## 🎥 Video Codecs

- `H264` - Standard compression (3-5 Mbps @ 2MP)
- `H265` - High efficiency (1.5-2.5 Mbps @ 2MP)
- `H265+` - Ultra efficient (1-1.5 Mbps @ 2MP)
- `MJPEG` - Motion JPEG (20-40 Mbps @ 2MP)
- `MPEG4` - Legacy codec (4-6 Mbps @ 2MP)
- `Smart264` - Vendor-specific optimization

---

## 📏 Minimum Requirements by Location

| Location | Resolution | FPS | Night Vision | Audio | PTZ | LPR |
|----------|-----------|-----|--------------|-------|-----|-----|
| Entrance/Exit | 2MP | 25 | ✅ | ❌ | ❌ | ❌ |
| Cash Counter | 2MP | 30 | ❌ | ✅ | ✅ | ❌ |
| Strong Room | 2MP | 30 | ✅ | ❌ | ❌ | ❌ |
| ATM Cabin | 2MP | 25 | ✅ | ❌ | ❌ | ❌ |
| Manager Cabin | 2MP | 25 | ❌ | ❌ | ❌ | ❌ |
| Locker Room | 2MP | 25 | ❌ | ❌ | ❌ | ❌ |
| Server Room | 2MP | 25 | ✅ | ❌ | ❌ | ❌ |
| Parking | 2MP | 15 | ✅ | ❌ | ❌ | ✅ |
| Perimeter | 2MP | 15 | ✅ | ❌ | ❌ | ❌ |
| Staircase | 2MP | 25 | ❌ | ❌ | ❌ | ❌ |
| Corridor | 2MP | 25 | ❌ | ❌ | ❌ | ❌ |

---

## 📅 Retention Periods

| Location | Minimum | Recommended |
|----------|---------|-------------|
| Cash Counter | 90 days | 180 days |
| Strong Room | 90 days | 365 days |
| ATM | 90 days | 180 days |
| Entrance/Exit | 30 days | 90 days |
| Parking | 30 days | 60 days |
| Perimeter | 30 days | 60 days |
| Corridors | 30 days | 60 days |

---

## 🔌 API Endpoints Summary

### Camera Specifications
```
GET    /v1/cameras/:id/specifications
PUT    /v1/cameras/:id/specifications
```

### Camera Compliance
```
GET    /v1/cameras/:id/compliance
PUT    /v1/cameras/:id/compliance
```

### Camera Details
```
PATCH  /v1/cameras/:id/details
```

### Branch Requirements
```
GET    /v1/branches/:branchId/camera-requirements
PUT    /v1/branches/:branchId/camera-requirements
POST   /v1/branches/:branchId/camera-requirements/initialize
```

### Reports
```
GET    /v1/branches/:branchId/coverage-gaps
GET    /v1/branches/:branchId/compliance-summary
GET    /v1/inspections/due?days=30
```

---

## 📊 Database Tables

### `camera_specifications`
Technical specs: resolution, frame rate, FOV, IR distance, etc.

### `camera_installation_compliance`
Compliance tracking: requirements met, inspection dates, etc.

### `branch_camera_requirements`
Required coverage: location type, count, min specs, priority.

### Views
- `branch_camera_coverage_gaps` - Missing cameras
- `camera_compliance_summary` - Compliance status

---

## 🚀 Quick Setup Commands

### 1. Run Migrations
```bash
psql $DATABASE_URL < database/migrations/004_cctv_infrastructure.sql
psql $DATABASE_URL < database/migrations/005_cctv_infrastructure_seed.sql
```

### 2. Initialize Branch Requirements
```bash
curl -X POST http://localhost:8080/v1/branches/{branchId}/camera-requirements/initialize \
  -H "x-user-id: user-global-admin"
```

### 3. Update Camera Details
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

### 4. Add Specifications
```bash
curl -X PUT http://localhost:8080/v1/cameras/{id}/specifications \
  -H "Content-Type: application/json" \
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

### 5. Record Compliance
```bash
curl -X PUT http://localhost:8080/v1/cameras/{id}/compliance \
  -H "Content-Type: application/json" \
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

### 6. Check Coverage Gaps
```bash
curl http://localhost:8080/v1/branches/{branchId}/coverage-gaps \
  -H "x-user-id: user-global-admin"
```

### 7. Get Compliance Summary
```bash
curl http://localhost:8080/v1/branches/{branchId}/compliance-summary \
  -H "x-user-id: user-global-admin"
```

---

## 💾 Storage Calculation

**Formula:**
```
Storage (GB) = Bitrate (Mbps) × 3,600 × 24 × Days ÷ 8,192
```

**Example (2MP @ 4 Mbps for 30 days):**
```
Storage = 4 × 3,600 × 24 × 30 ÷ 8,192 = ~1,266 GB per camera
```

**Branch Estimate (8 cameras):**
- 3 high-priority: 180 days @ 4 Mbps = 7,596 GB
- 5 standard: 60 days @ 3 Mbps = 4,736 GB
- **Total: ~12 TB per branch**

**Organization (500 branches):**
- **Total: ~6 PB**

---

## 🎯 Common Queries

### Get all non-compliant cameras
```sql
SELECT * FROM camera_compliance_summary
WHERE compliance_status = 'non-compliant';
```

### Get coverage gaps by priority
```sql
SELECT * FROM branch_camera_coverage_gaps
WHERE priority <= 2
ORDER BY priority, gap_count DESC;
```

### Get cameras due for inspection
```sql
SELECT * FROM camera_installation_compliance
WHERE next_inspection_date <= CURRENT_DATE + INTERVAL '30 days'
AND next_inspection_date >= CURRENT_DATE
ORDER BY next_inspection_date;
```

### Branch compliance percentage
```sql
SELECT 
  branch_name,
  COUNT(*) as total_cameras,
  SUM(CASE WHEN compliance_status = 'compliant' THEN 1 ELSE 0 END) as compliant,
  ROUND(100.0 * SUM(CASE WHEN compliance_status = 'compliant' THEN 1 ELSE 0 END) / COUNT(*), 2) as compliance_pct
FROM camera_compliance_summary
GROUP BY branch_name
ORDER BY compliance_pct;
```

---

## 🔐 Permissions

| Action | Required Permission |
|--------|-------------------|
| View specifications | `live:view` |
| Update specifications | `device:configure` |
| View compliance | `live:view` |
| Update compliance | `device:configure` |
| Update details | `device:configure` |
| View requirements | `live:view` |
| Update requirements | `device:configure` |
| View reports | `audit:view` |

---

## 📝 TypeScript Types Quick Reference

```typescript
// Location Type
type CameraLocationType = 
  | "branch-entrance" | "branch-exit" | "cash-counter"
  | "manager-cabin" | "strong-room" | "vault" | "locker-room"
  | "atm-cabin" | "parking-area" | "perimeter-fence"
  | "staircase" | "corridor" | "server-room" | "lobby"
  | "teller-area" | "safe-deposit" | "other";

// Physical Type
type PhysicalCameraType = 
  | "dome-indoor" | "dome-outdoor" | "bullet-indoor" 
  | "bullet-outdoor" | "ptz" | "fixed" | "thermal"
  | "license-plate-recognition" | "panoramic" | "fisheye";

// Weatherproof Rating
type WeatherproofRating = 
  | "IP20" | "IP33" | "IP44" | "IP54"
  | "IP65" | "IP66" | "IP67" | "IP68";

// Video Codec
type VideoCodec = 
  | "H264" | "H265" | "H265+" | "MJPEG" 
  | "MPEG4" | "Smart264";
```

---

## 📚 Documentation Links

- **[CCTV_INFRASTRUCTURE_INTEGRATION.md](CCTV_INFRASTRUCTURE_INTEGRATION.md)** - Complete integration guide
- **[CCTV_IMPLEMENTATION_SUMMARY.md](CCTV_IMPLEMENTATION_SUMMARY.md)** - Implementation summary
- **[docs/cctv-infrastructure-standards.md](docs/cctv-infrastructure-standards.md)** - Detailed standards
- **[INDEX.md](INDEX.md)** - Complete documentation index

---

## 🎓 Learning Path

1. **Start**: [CCTV_IMPLEMENTATION_SUMMARY.md](CCTV_IMPLEMENTATION_SUMMARY.md) (10 min)
2. **Deep Dive**: [CCTV_INFRASTRUCTURE_INTEGRATION.md](CCTV_INFRASTRUCTURE_INTEGRATION.md) (20 min)
3. **Standards**: [docs/cctv-infrastructure-standards.md](docs/cctv-infrastructure-standards.md) (30 min)
4. **Reference**: This document (ongoing)

---

**Version**: 1.0  
**Last Updated**: 2026-07-21  
**Audience**: Developers, System Administrators
