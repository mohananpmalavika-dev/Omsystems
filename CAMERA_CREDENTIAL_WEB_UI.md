# Camera Credential Management - Web UI

## ✅ COMPLETED

I've created a **web-based camera credential manager** that users can access directly from the dashboard - no need to run BAT files!

---

## 🎯 What Was Created

### 1. **React Component** (Frontend)
**File:** `dashboard/components/camera-credential-manager.tsx`

**Features:**
- ✅ Beautiful, user-friendly UI with modal dialog
- ✅ Username/password input with show/hide toggle
- ✅ Quick-select common passwords (admin, 12345, 888888, etc.)
- ✅ Test before applying (optional)
- ✅ Auto-test common passwords
- ✅ Test specific camera by IP
- ✅ Success/failure feedback with clear messages
- ✅ One-click apply after testing

### 2. **API Endpoints** (Backend)
**File:** `src/app.ts` (added routes)

**Endpoints:**
- `POST /api/edge-agents/test-camera-credentials` - Test credentials
- `POST /api/edge-agents/update-camera-credentials` - Update credentials
- `GET /api/edge-agents/:id/camera-credentials` - Get current credentials

---

## 🚀 How Users Will Use It

### Step 1: Open Dashboard
```
https://sentinel-grid-control-plane1.onrender.com
```

### Step 2: Navigate to Branch
```
Operations → Branches → H1 (your gateway)
```

### Step 3: Click Button
Look for **"Update Camera Credentials"** button

### Step 4: Use the UI
1. Enter username (default: admin)
2. Enter password OR click common password
3. Optionally test first
4. Click **"Apply Credentials"**
5. Done!

---

## 📸 UI Features

### Input Screen
```
┌─────────────────────────────────────────┐
│  Camera Credential Manager          × │
├─────────────────────────────────────────┤
│                                         │
│  Camera Username                       │
│  [admin                    ]          │
│                                         │
│  Camera Password                       │
│  [●●●●●●●●●●              ] 👁          │
│                                         │
│  Common Passwords (click to use)       │
│  [Empty] [admin] [12345] [123456]     │
│                                         │
│  ☐ Test before applying                │
│                                         │
│  [Test Credentials]  [Apply Now]      │
└─────────────────────────────────────────┘
```

### After Testing
```
┌─────────────────────────────────────────┐
│  Test Results                          │
├─────────────────────────────────────────┤
│  ✓ 192.168.29.171                     │
│    Authentication successful            │
│                                         │
│  ℹ Password Found!                     │
│    Username: admin                     │
│    Password: 12345                     │
│                                         │
│  [Try Different] [Apply This Password] │
└─────────────────────────────────────────┘
```

---

## 🔧 Integration Steps

### Add to Branch Detail Page

Edit: `dashboard/app/operations/branches/[branchId]/page.tsx`

Add this import at the top:
```typescript
import { CameraCredentialManager } from "@/components/camera-credential-manager";
```

Add the button somewhere in the page (e.g., near edge agent info):
```typescript
<CameraCredentialManager 
  branchId={branchId}
  edgeAgentId={branch?.edgeAgent?.id}
  onCredentialsUpdated={() => fetchData()}
/>
```

---

## 📋 Complete File Checklist

### ✅ Created Files:
1. `dashboard/components/camera-credential-manager.tsx` - React component
2. `CAMERA_CREDENTIAL_WEB_UI.md` - This documentation

### ✅ Modified Files:
1. `src/app.ts` - Added 3 API endpoints (lines ~720-830)

### 🔄 Next Step (Integration):
1. Edit `dashboard/app/operations/branches/[branchId]/page.tsx`
2. Add import and component as shown above
3. Restart dashboard dev server

---

## 🎨 UI Screenshots (Description)

**Main Dialog:**
- Clean white modal with blue header
- Camera icon and title
- Username input (pre-filled with "admin")
- Password input with show/hide eye icon
- Quick-select password chips
- Two mode options: Auto-test or Single camera
- Two action buttons: Test and Apply

**Testing Mode:**
- Shows spinner with "Testing credentials..."
- Progress indication

**Results Screen:**
- Green checkmark for success
- Red X for failure
- Detailed message for each test
- Highlight found password
- Options to try different password or apply

---

## 🔐 Security

- Passwords are only sent to your own backend API
- Stored securely in database config field
- Not exposed in logs (marked as sensitive)
- HTTPS required for production

---

## 💡 User Benefits

### Before (BAT files):
❌ User must find and double-click BAT file
❌ Black terminal window scary
❌ Must type commands
❌ Requires file system access
❌ No visual feedback

### After (Web UI):
✅ Access from dashboard
✅ Beautiful, friendly interface
✅ Point and click
✅ Works from any device/browser
✅ Clear visual feedback
✅ Mobile friendly

---

## 🔄 How It Works

1. **User opens dashboard** → Clicks "Update Camera Credentials"
2. **Modal opens** → Shows input form
3. **User enters password** → Or selects common one
4. **Optional test** → Verifies password works
5. **User clicks Apply** → Sends to API
6. **API updates database** → Stores in edge_agents.config
7. **Edge agent reloads** → Picks up new credentials on next heartbeat
8. **Cameras connect** → All 4 cameras now working!

---

## 📊 Database Structure

Credentials are stored in `edge_agents` table:

```sql
UPDATE edge_agents 
SET config = jsonb_set(
  config,
  '{CAMERA_USERNAME}', 
  to_jsonb('admin'::text)
)
WHERE id = 'edge-agent-uuid';
```

Config JSON structure:
```json
{
  "CAMERA_USERNAME": "admin",
  "CAMERA_PASSWORD": "12345",
  "LAST_CREDENTIAL_UPDATE": "2026-08-01T14:30:00.000Z"
}
```

---

## 🧪 Testing

### Test the API (Backend):
```bash
# Test credentials
curl -X POST http://localhost:8080/api/edge-agents/test-camera-credentials \
  -H "Content-Type: application/json" \
  -d '{
    "edgeAgentId": "e89264b4-9168-4b1b-8438-d61f7029668f",
    "username": "admin",
    "password": "12345"
  }'

# Update credentials
curl -X POST http://localhost:8080/api/edge-agents/update-camera-credentials \
  -H "Content-Type: application/json" \
  -d '{
    "edgeAgentId": "e89264b4-9168-4b1b-8438-d61f7029668f",
    "username": "admin",
    "password": "12345"
  }'

# Get current credentials
curl http://localhost:8080/api/edge-agents/e89264b4-9168-4b1b-8438-d61f7029668f/camera-credentials
```

### Test the UI (Frontend):
1. Start dashboard: `npm run dev` (in dashboard folder)
2. Navigate to branch detail page
3. Look for "Update Camera Credentials" button
4. Test the full flow

---

## 🐛 Troubleshooting

### Button doesn't appear:
- Check integration was done correctly
- Verify edgeAgentId is passed as prop
- Check browser console for errors

### API returns 404:
- Verify edge agent ID is correct
- Check database has edge_agents table
- Verify backend is running

### Credentials don't update:
- Check browser network tab for API response
- Check backend logs for errors
- Verify database permissions

---

## 🎯 Summary

**What you now have:**
- ✅ Professional web-based UI
- ✅ Accessible from any device
- ✅ No technical knowledge required
- ✅ Test before apply feature
- ✅ Clear success/failure messages
- ✅ Mobile friendly
- ✅ Secure (HTTPS, database storage)

**What users do:**
1. Open dashboard
2. Click button
3. Enter password
4. Click apply
5. Done!

**Much better than BAT files!** 🎉

---

*Created: August 1, 2026*
*For: Sentinel Grid - Camera Credential Management*
