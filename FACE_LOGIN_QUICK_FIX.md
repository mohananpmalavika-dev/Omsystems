# Face Login Fix for mgdhanyamohan

**Issue:** Face login fails - "Face not recognized"  
**Root Cause:** User mgdhanyamohan has NO face templates enrolled in database  
**Date:** September 16, 2026

---

## ✅ SOLUTION (Takes 2 minutes)

### Step 1: Admin Opens Employee Edit Page
1. Login as admin (BASANTH or Krypton)
2. Navigate to: **Admin → Organization → Employees Tab**
3. Find user: **mgdhanyamohan**
4. Click the **Edit (pencil) icon**

### Step 2: Capture Face Photos
1. In the edit modal, look for **"Face Photo" or "Biometric Enrollment"** section
2. Click **"Start Webcam"** or **"Capture Photo"** button
3. Capture **3-5 poses** (minimum 3 required):
   - ✅ **Front view** (looking straight at camera) - REQUIRED
   - ✅ **30° left turn** - REQUIRED  
   - ✅ **30° right turn** - REQUIRED
   - Optional: Slight up tilt
   - Optional: Slight down tilt

**Important Capture Tips:**
- Good lighting (natural daylight best)
- Face camera directly
- Stay 1-3 feet from camera
- Remove glasses if possible
- Keep face steady for 2-3 seconds per capture

### Step 3: Save Changes
1. Click **"Save"** or **"Update Employee"** button
2. Wait for success message
3. Done! Face templates are now saved to database

### Step 4: Test Face Login
1. **Logout** from current session
2. Go to login page
3. Click **"Face Login"** button (if available)
4. **Face the camera** and wait 2-3 seconds
5. Should now successfully authenticate!

---

## 🔍 Verification

To confirm enrollment worked, run:
```bash
node check-face-enrollment.mjs mgdhanyamohan
```

**Expected Output:**
```
✅ ENROLLED
Version: 2
Template Count: 3-5
Enrolled At: [date]
```

---

## 🛠️ Technical Details

### What Happens Behind the Scenes:

**1. Frontend Captures Photos:**
```javascript
// dashboard/app/admin/organization/page.tsx
const captures = [dataUrl1, dataUrl2, dataUrl3];
```

**2. Sent to Backend:**
```http
PATCH /api/control/v1/users/3dc9aac7-052b-4342-b94c-a64062de1ce1
Content-Type: application/json

{
  "facePhotosBase64": [
    "data:image/jpeg;base64,...",
    "data:image/jpeg;base64,...",
    "data:image/jpeg;base64,..."
  ]
}
```

**3. Backend Processes (src/routes/user.routes.ts):**
```typescript
if (body.facePhotosBase64) {
  const profile = await createEmployeeFaceProfile(body.facePhotosBase64);
  const preferences = faceTemplatePreferences(profile);
  // Saved to user.preferences column in database
}
```

**4. Database Storage:**
```json
{
  "faceVerification": {
    "version": 2,
    "templates": [
      { "version": 1, "width": 48, "height": 48, "data": "..." },
      { "version": 1, "width": 48, "height": 48, "data": "..." },
      { "version": 1, "width": 48, "height": 48, "data": "..." }
    ],
    "enrolledAt": "2026-09-16T10:30:00Z",
    "method": "multi-pose-normalized-face-template"
  }
}
```

### Face Login Query:
```sql
SELECT * FROM users
WHERE status = 'active'
  AND (preferences->'faceVerification'->>'data') IS NOT NULL
  -- OR for version 2: preferences->'faceVerification'->'templates' IS NOT NULL
```

---

## ❌ Common Issues

### Issue: "Cannot find Edit button"
**Solution:** Only admins (super_admin, company_admin) can edit employees. Make sure you're logged in as admin.

### Issue: "Webcam not working"
**Solution:** 
- Check browser camera permissions
- Try different browser (Chrome recommended)
- Ensure no other app is using webcam

### Issue: "Face photos save but login still fails"
**Possible causes:**
1. **Templates didn't save** - Check with diagnostic: `node check-face-enrollment.mjs mgdhanyamohan`
2. **Old query looking for wrong field** - Check if backend query uses `preferences->'faceVerification'->>'data'` (version 1) vs `preferences->'faceVerification'->'templates'` (version 2)
3. **Lighting/quality issues during login** - Try better lighting

### Issue: "Face login works sometimes but not always"
**Solution:**
- Match lighting conditions from enrollment
- Face camera directly (no side angles)
- Stay same distance as enrollment (1-3 feet)
- Re-enroll with better quality photos if score consistently below 0.70

---

## 📊 Face Matching Thresholds

| Score Range | Meaning | Action |
|------------|---------|--------|
| 0.85 - 1.00 | Genuine user (typical) | ✅ Login succeeds |
| 0.70 - 0.84 | Borderline match | ✅ Login succeeds (default threshold) |
| 0.60 - 0.69 | Below threshold | ❌ Login fails - Re-enroll with better photos |
| 0.40 - 0.59 | Significant mismatch | ❌ Wrong person or poor quality |
| Below 0.40 | No face detected | ❌ No face in image |

**Default Production Threshold:** 0.70 (70% similarity required)

---

## 🔐 Security Notes

1. **Templates are encrypted** in database (stored in JSONB column)
2. **Original photos are NOT stored** - only normalized 48x48 templates
3. **Password login always available** as fallback
4. **Face login uses 1-to-N matching** (compares against all enrolled users in tenant)
5. **Multi-pose enrollment** (version 2) is more robust than single-photo (version 1)

---

## 📞 Need Help?

**Diagnostic Commands:**
```bash
# Check enrollment status
node check-face-enrollment.mjs mgdhanyamohan

# List all users  
node list-all-users.mjs

# Check face login logs (admin access required)
# Look for: [FaceLogin] Evaluation complete
# Shows: candidateCount, matchedUser, score
```

**Contacts:**
- IT Support: support@kryptonlogic.com
- Emergency: 1-800-KRYPTON

---

**Document Version:** 1.0  
**Last Updated:** September 16, 2026  
**Author:** Kiro AI Assistant
