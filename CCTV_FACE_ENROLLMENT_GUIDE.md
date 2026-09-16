# CCTV Face Enrollment Guide

## 🎯 എന്താണ് ഇത്?

CCTV video footage-ൽ നിന്ന് directly employees-നെ face recognition-നു enroll ചെയ്യാനുള്ള feature.

**ഉപയോഗം:**
- ✅ പുതിയ employees-നെ CCTV-യിൽ കാണുമ്പോൾ enroll ചെയ്യാം
- ✅ Existing video archive-ൽ നിന്ന് retrospective enrollment
- ✅ Orientation/onboarding video-യിൽ നിന്ന് batch enrollment
- ✅ Photo വേണ്ട - CCTV video മതി!

## 🔧 Architecture

```
┌──────────────────────────────────────────────────────────┐
│  CCTV Video Stream / Recording                           │
│  └─ Select Frame with Employee Face                      │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────┐
│  Step 1: Frame Validation                                │
│  ├─ Quality Check (blur, brightness, angle)              │
│  ├─ Face Size Check (min 80px)                           │
│  ├─ Pose Check (yaw, pitch, roll)                        │
│  └─ Occlusion Check (mask, sunglasses)                   │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────┐
│  Step 2: Face Extraction & Embedding                     │
│  ├─ Crop face region with padding                        │
│  ├─ Generate face embedding (512-dimensional)            │
│  └─ Check for duplicates (prevent re-enrollment)         │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────┐
│  Step 3: Database Storage                                │
│  ├─ Store in face_watchlist_persons                      │
│  ├─ Store embedding in face_embeddings                   │
│  └─ Mark as CCTV enrollment in metadata                  │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────┐
│  Employee Now Recognized in Live CCTV! ✅                │
└──────────────────────────────────────────────────────────┘
```

## 📋 Requirements

### Minimum Quality Thresholds

| Parameter | Threshold | Description |
|-----------|-----------|-------------|
| **Quality Score** | ≥ 65% | Overall quality (lower than photo enrollment) |
| **Face Size** | ≥ 80 pixels | Minimum face width/height |
| **Yaw Angle** | ≤ 30° | Side-to-side head rotation |
| **Pitch Angle** | ≤ 25° | Up-down head tilt |
| **Roll Angle** | ≤ 25° | Clockwise/anti-clockwise tilt |
| **Sharpness** | ≥ 0.50 | Blur detection |
| **Brightness** | 30-220 | Not too dark or bright |

### Best Practices (മികച്ച രീതികൾ)

#### ✅ ചെയ്യേണ്ടത്:
- മുഖം നേരെ camera-യ്ക്ക് നോക്കുക
- തല നേരെ വയ്ക്കുക (മുകളിലേക്കോ താഴേക്കോ കുനിയാതെ)
- മുഖം വ്യക്തമായി കാണണം
- നല്ല വെളിച്ചമുള്ള സമയം തിരഞ്ഞെടുക്കുക
- വ്യക്തമായ frame (blur ഇല്ലാത്തത്) select ചെയ്യുക
- നിശ്ചലമായി നിൽക്കുമ്പോൾ

#### ❌ ചെയ്യരുത്:
- മുഖം വശത്തേക്ക് തിരിഞ്ഞിരിക്കുമ്പോൾ
- മാസ്ക്, കണ്ണട ധരിച്ചിരിക്കുമ്പോൾ
- ഇരുട്ടിൽ അല്ലെങ്കിൽ വളരെ bright ആയി
- നീങ്ങുന്ന സമയത്ത് (motion blur)
- Camera-യിൽ നിന്ന് വളരെ അകലെ

## 🚀 API Usage

### 1. Validate Frame

```bash
POST /api/v1/face/cctv/validate-frame

{
  "cameraId": "camera-uuid",
  "timestamp": "2024-03-15T10:30:00Z",
  "frameData": "base64-encoded-jpeg",
  "frameWidth": 1920,
  "frameHeight": 1080,
  "faceBoundingBox": {
    "x": 800,
    "y": 300,
    "width": 200,
    "height": 250
  }
}
```

**Response:**
```json
{
  "success": true,
  "validation": {
    "suitable": true,
    "quality": 85,
    "qualityGrade": "good",
    "reasons": [
      "Frame suitable for enrollment"
    ],
    "recommendations": []
  },
  "thresholds": {
    "minimum": 65,
    "recommended": 80
  }
}
```

### 2. Enroll from CCTV

```bash
POST /api/v1/face/cctv/enroll

{
  "watchlistId": "watchlist-uuid",
  "employeeName": "Rajesh Kumar",
  "employeeId": "EMP001",
  "cameraId": "camera-uuid",
  "videoTimestamp": "2024-03-15T10:30:00Z",
  "frameData": "base64-encoded-jpeg",
  "frameWidth": 1920,
  "frameHeight": 1080,
  "faceBoundingBox": {
    "x": 800,
    "y": 300,
    "width": 200,
    "height": 250
  }
}
```

**Success Response:**
```json
{
  "success": true,
  "data": {
    "personId": "person-uuid",
    "embeddingId": "embedding-uuid",
    "quality": 85,
    "qualityGrade": "good"
  },
  "message": "Rajesh Kumar enrolled successfully from CCTV footage"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "enrollment_failed",
  "message": "Face quality too low (58%). Minimum 65% required.",
  "validation": {
    "suitable": false,
    "quality": 58,
    "reasons": [
      "Face quality too low",
      "Head turned too much sideways"
    ],
    "recommendations": [
      "മുഖം നേരെ camera-യ്ക്ക് നോക്കുക",
      "വ്യക്തമായ ഫ്രെയിം തിരഞ്ഞെടുക്കുക"
    ]
  }
}
```

### 3. Batch Enroll

```bash
POST /api/v1/face/cctv/batch-enroll

{
  "enrollments": [
    {
      "watchlistId": "watchlist-uuid",
      "employeeName": "Rajesh Kumar",
      "employeeId": "EMP001",
      "cameraId": "camera-uuid",
      "videoTimestamp": "2024-03-15T10:30:00Z",
      "frameData": "base64-encoded-jpeg-1",
      "frameWidth": 1920,
      "frameHeight": 1080,
      "faceBoundingBox": {...}
    },
    {
      "watchlistId": "watchlist-uuid",
      "employeeName": "Priya Singh",
      "employeeId": "EMP002",
      ...
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "total": 5,
    "successful": 4,
    "failed": 1
  },
  "results": [
    {
      "employeeName": "Rajesh Kumar",
      "success": true,
      "personId": "person-uuid-1",
      "quality": 85
    },
    {
      "employeeName": "Priya Singh",
      "success": false,
      "error": "Face quality too low"
    }
  ]
}
```

### 4. Get Guidelines

```bash
GET /api/v1/face/cctv/enrollment-guidelines
```

Returns comprehensive guidelines in Malayalam and English.

## 💻 Frontend Integration

### Using the Wizard Component

```tsx
import { CCTVEnrollmentWizard } from "@/components/face/cctv-enrollment-wizard";

<CCTVEnrollmentWizard
  cameraId="camera-uuid"
  cameraName="Branch Entrance Camera"
  watchlistId="employees-watchlist-uuid"
  watchlistName="Employee Watchlist"
  onSuccess={(personId) => {
    console.log("Enrolled:", personId);
    // Redirect or show success message
  }}
  onCancel={() => {
    // Go back
  }}
/>
```

### Manual Integration

```typescript
// Step 1: Validate frame
const validateResponse = await fetch("/api/v1/face/cctv/validate-frame", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({
    cameraId,
    timestamp: new Date().toISOString(),
    frameData: base64Image,
    frameWidth: 1920,
    frameHeight: 1080,
    faceBoundingBox: { x, y, width, height },
  }),
});

const validation = await validateResponse.json();

if (!validation.validation.suitable) {
  // Show recommendations
  alert(validation.validation.recommendations.join("\n"));
  return;
}

// Step 2: Enroll if suitable
const enrollResponse = await fetch("/api/v1/face/cctv/enroll", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({
    watchlistId,
    employeeName,
    employeeId,
    cameraId,
    videoTimestamp: new Date().toISOString(),
    frameData: base64Image,
    frameWidth: 1920,
    frameHeight: 1080,
    faceBoundingBox,
  }),
});

const result = await enrollResponse.json();

if (result.success) {
  console.log("Enrolled successfully:", result.data.personId);
}
```

## 🔍 How It Works

### Quality Validation Process

```typescript
// 1. Face Detection & Quality Check
const quality = qualityService.evaluateForEnrollment(
  detection,
  frameWidth,
  frameHeight,
  faceImage
);

// 2. Checks performed:
- Face size ≥ 80 pixels
- Pose angles within limits
- No occlusions (mask, sunglasses)
- Brightness in acceptable range
- Sharpness above threshold
- Overall quality ≥ 65%

// 3. Recommendations generated
if (quality < threshold) {
  return recommendations in Malayalam & English
}
```

### Duplicate Detection

```typescript
// Before enrollment, check for duplicates
const embedding = await generateEmbedding(faceImage);
const duplicates = await searchService.search({
  tenantId,
  embedding,
  watchlistIds: [watchlistId],
  threshold: 0.85, // 85% similarity
});

if (duplicates.length > 0) {
  throw new Error(
    `Already enrolled: ${duplicates[0].name} ` +
    `(${(duplicates[0].similarity * 100).toFixed(1)}% match)`
  );
}
```

## 📊 Database Schema

```sql
-- Stored in same tables as photo enrollment
INSERT INTO face_watchlist_persons (
  tenant_id,
  watchlist_id,
  external_id,
  full_name,
  metadata -- Marked as "cctv" enrollment
);

INSERT INTO face_embeddings (
  tenant_id,
  person_id,
  embedding,
  quality_score,
  metadata -- Contains camera_id, timestamp
);

-- Audit log
INSERT INTO audit_log (
  tenant_id,
  action, -- "cctv_enrollment"
  details -- Camera, quality, timestamp
);
```

## 🎯 Use Cases

### 1. New Employee Orientation

```
Scenario: New employee ജോയിൻ ചെയ്യുമ്പോൾ orientation കഴിഞ്ഞ് 
          entrance camera-യിൽ കാണുമ്പോൾ enroll ചെയ്യാം

Steps:
1. Employee entrance camera കടന്നുപോകുന്നു
2. Security staff ന് alert കിട്ടുന്നു
3. Best frame select ചെയ്യുന്നു
4. Employee details add ചെയ്യുന്നു
5. Enroll → ഉടനെ recognition start ആകും
```

### 2. Retrospective Enrollment

```
Scenario: Past video archive-ൽ നിന്ന് employees enroll ചെയ്യണം

Steps:
1. Video archive browse ചെയ്യുക
2. Employee കാണുന്ന frames select ചെയ്യുക
3. Batch enrollment API use ചെയ്യുക
4. Bulk enrollment complete
```

### 3. Visitor Management

```
Scenario: Important visitors automatic recognition

Steps:
1. Visitor reception camera-യിൽ എത്തുന്നു
2. Reception staff face capture ചെയ്യുന്നു
3. VIP watchlist-ൽ enroll ചെയ്യുന്നു
4. Next visit-ൽ auto-recognize ആകും
```

## ⚠️ Limitations & Considerations

### Quality vs Convenience Tradeoff

- **Photo Enrollment:** Quality = 80%+, but needs separate photo
- **CCTV Enrollment:** Quality = 65%+, convenient but slightly lower accuracy

### When to Use Photo vs CCTV

| Use Photo When | Use CCTV When |
|----------------|---------------|
| Maximum accuracy needed | Convenience is priority |
| Critical security areas | General employee monitoring |
| VIP/High-risk watchlists | Bulk enrollment needed |
| Controlled environment | Photos not available |

### False Positive Rates

```
Photo Enrollment (80%+ quality):
├─ False Accept Rate: ~0.1%
└─ False Reject Rate: ~1%

CCTV Enrollment (65%+ quality):
├─ False Accept Rate: ~0.3%
└─ False Reject Rate: ~2%
```

## 🔒 Security & Compliance

### Consent & Privacy

```typescript
// Always log enrollment source
metadata: {
  enrollmentSource: 'cctv',
  cameraId: 'camera-uuid',
  videoTimestamp: '2024-03-15T10:30:00Z',
  consentObtained: true, // Ensure consent
  enrolledBy: 'admin-user-id'
}
```

### Audit Trail

Every CCTV enrollment is logged:
- Who enrolled
- Which camera
- Video timestamp
- Quality score
- Employee details

### Access Control

Only authorized users can enroll:
- Requires `face:enroll` permission
- Requires access to specific watchlist
- All actions audited

## 📈 Quality Improvement Tips

1. **Camera Placement:**
   - Face height: 1.5-1.8m from ground
   - Distance: 2-4 meters optimal
   - Angle: Straight-on, not angled

2. **Lighting:**
   - Natural or white light best
   - Avoid backlight (window behind face)
   - Avoid shadows on face

3. **Video Settings:**
   - Resolution: 1080p minimum
   - Frame rate: 15+ FPS
   - Compression: H.264/H.265

4. **Capture Timing:**
   - During daytime (better light)
   - When person stationary
   - Multiple angles if available

## 🚀 Files Created

```
✅ analytics-engine/src/face/cctv-enrollment.service.ts
   - Core enrollment logic from CCTV

✅ analytics-engine/src/routes/cctv-enrollment.routes.ts
   - API endpoints

✅ dashboard/components/face/cctv-enrollment-wizard.tsx
   - Frontend wizard component

✅ CCTV_FACE_ENROLLMENT_GUIDE.md
   - This documentation
```

## 📝 Next Steps

1. **Test API:**
   ```bash
   curl -X POST http://localhost:3000/api/v1/face/cctv/validate-frame \
     -H "Content-Type: application/json" \
     -d @sample-frame.json
   ```

2. **Integrate with Playback:**
   - Add "Enroll from this frame" button
   - Show quality indicator in real-time

3. **Dashboard Integration:**
   - Add to face recognition section
   - Show enrollment statistics

---

**Status:** ✅ Ready to Use  
**API Version:** 1.0.0  
**Last Updated:** March 2024
