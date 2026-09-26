# KryptoVision Connect - Device Enrollment Guide
# ഡിവൈസ് എൻറോൾമെന്റ് ഗൈഡ്

---

## 🎯 എൻറോൾമെന്റ് എന്താണ്? (What is Enrollment?)

**English:** Device enrollment is the process of registering a branch computer/device so it can make and receive calls through KryptoVision Connect.

**മലയാളം:** ബ്രാഞ്ച് കമ്പ്യൂട്ടർ/ഡിവൈസ് രജിസ്റ്റർ ചെയ്ത്, KryptoVision Connect വഴി കോളുകൾ ചെയ്യാനും സ്വീകരിക്കാനും സാധിക്കുന്ന പ്രക്രിയയാണ് ഡിവൈസ് എൻറോൾമെന്റ്.

---

## 👥 ആർക്കൊക്കെ എന്തു ചെയ്യണം? (Who Does What?)

### 1. **Admin/IT (കേന്ദ്ര ഓഫീസ്)**
- ✅ Enrollment code generate ചെയ്യുക
- ✅ Code ബ്രാഞ്ചിലേക്ക് സുരക്ഷിതമായി അയക്കുക
- ✅ Enrolled devices manage ചെയ്യുക
- ✅ Employees link ചെയ്യുക (shared devices വേണമെങ്കിൽ)

### 2. **Branch Staff (ബ്രാഞ്ച് സ്റ്റാഫ്)**
- ✅ Enrollment code വാങ്ങുക
- ✅ Device enroll ചെയ്യുക
- ✅ Device name നൽകുക
- ✅ VMS ടീമിനെ വിളിക്കുക

---

## 🔐 Step-by-Step Process

### STEP 1: Admin - Enrollment Code Generate ചെയ്യുക

**Location/സ്ഥലം:**  
VMS Dashboard → Communications → Device Management → Generate Code

**Steps:**

1. **Login ചെയ്യുക** as Admin
   ```
   URL: https://vms.yourdomain.com
   ```

2. **Navigate ചെയ്യുക:**
   ```
   Dashboard → Communications → Admin → Device Management
   ```
   അല്ലെങ്കിൽ നേരിട്ട്:
   ```
   https://vms.yourdomain.com/communications/admin/devices
   ```

3. **"Generate Code" ബട്ടൺ ക്ലിക്ക് ചെയ്യുക**

4. **Details നൽകുക:**
   - **Branch:** Select ചെയ്യുക (e.g., "Kollam Main Branch")
   - **Expires In:** എത്ര മണിക്കൂർ കഴിഞ്ഞ് കോഡ് expire ആകണം (default: 24 hours)
   - **Note:** Optional (e.g., "Reception PC enrollment")

5. **"Generate Code" ക്ലിക്ക് ചെയ്യുക**

6. **Code കോപ്പി ചെയ്യുക:**
   ```
   Example: ABCD-1234-EFGH-5678
   ```

7. **Code ബ്രാഞ്ചിലേക്ക് അയക്കുക:**
   - WhatsApp (സുരക്ഷിതം)
   - Email (encrypted)
   - SMS (താൽക്കാലികമായി മാത്രം)
   - Phone call (വായിച്ചു പറയുക)

**⚠️ സുരക്ഷ:**
- Public channels ഇൽ share ചെയ്യരുത്
- Screenshot എടുത്ത് public ആയി post ചെയ്യരുത്
- Code use ചെയ്തതിന് ശേഷം delete ചെയ്യുക

---

### STEP 2: Branch - Device Enroll ചെയ്യുക

**Location/സ്ഥലം:**  
Branch Computer → VMS Dashboard → `/communications/connect`

**Steps:**

1. **Browser തുറക്കുക** (Chrome/Edge preferred)
   ```
   URL: https://vms.yourdomain.com/communications/connect
   ```

2. **Device enrollment section കണ്ടെത്തുക**
   - ആദ്യം തുറക്കുമ്പോൾ "Device Not Enrolled" കാണും
   - "Enroll This Device" ബട്ടൺ ഉണ്ടാകും

3. **"Enroll This Device" ക്ലിക്ക് ചെയ്യുക**

4. **Enrollment Code Enter ചെയ്യുക:**
   ```
   ABCD-1234-EFGH-5678
   ```
   - Spaces/hyphens അപ്രധാനം (automatically removed)
   - Case insensitive (capital/small ഒക്കെ same)

5. **Device Name നൽകുക:**
   ```
   Examples:
   - "Reception PC"
   - "Security Desk Computer"
   - "Branch Manager Laptop"
   - "Front Desk Tablet"
   ```
   **നല്ല പേരുകൾ:** സ്ഥലം + ഉപകരണം  
   **മോശം പേരുകൾ:** "Computer1", "Device", "Test"

6. **"Enroll Device" ബട്ടൺ ക്ലിക്ക് ചെയ്യുക**

7. **Success message കാണും:**
   ```
   ✓ Device enrolled successfully!
   Your device is now registered and ready to use.
   ```

8. **Page refresh ചെയ്യുക** (optional)
   - ഇപ്പോൾ "Call VMS Team" ബട്ടൺ കാണാം
   - Branch name display ആകും

**✅ സക്സസ്സ്!** Device ഇപ്പോൾ enrolled ആണ്.

---

### STEP 3: Admin - Employees Link ചെയ്യുക (Optional)

**ഇത് എപ്പോൾ വേണം?**
- Shared device ആണെങ്കിൽ (multiple employees use ചെയ്യുമ്പോൾ)
- Employee identity track ചെയ്യണമെങ്കിൽ
- Call history employee-wise വേണമെങ്കിൽ

**Steps:**

1. **Device Management page തുറക്കുക**
   ```
   Dashboard → Communications → Admin → Device Management
   ```

2. **Enrolled device കണ്ടെത്തുക** in list

3. **"Link Employee" ബട്ടൺ ക്ലിക്ക് ചെയ്യുക**

4. **Employee select ചെയ്യുക** from dropdown
   - അതേ branch ലെ employees മാത്രം കാണും
   - Name + Role കാണും (e.g., "Rajesh - Manager")

5. **"Link Employee" confirm ചെയ്യുക**

6. **Repeat** for more employees (if shared device)

**Device Model:**
```
ONE DEVICE = ONE BRANCH + MULTIPLE EMPLOYEES

Examples:
- Reception PC → Branch + [Receptionist1, Receptionist2]
- Security Desk → Branch + [Guard1, Guard2, Guard3]
- Manager Laptop → Branch + [Manager]
```

---

## 📱 UI Locations Summary

### Admin UI Locations

| Feature | URL Path | Purpose |
|---------|----------|---------|
| Device Management | `/communications/admin/devices` | Manage all devices |
| Generate Code | `/communications/admin/devices` → "Generate Code" | Create enrollment codes |
| View Codes | `/communications/admin/devices` → "Enrollment Codes" tab | See all codes |
| Link Employees | Device row → "Link Employee" | Link employees to device |

### Branch UI Locations

| Feature | URL Path | Purpose |
|---------|----------|---------|
| Connect Page | `/communications/connect` | Branch calling page |
| Enrollment | `/communications/connect` → "Enroll Device" | Enroll new device |
| Call VMS | `/communications/connect` → "Call VMS Team" | Call control room |

### Operator UI Locations

| Feature | URL Path | Purpose |
|---------|----------|---------|
| Calling Page | `/communications/calls` | VMS operator calling page |
| Call Branch | `/communications/calls` → Select branch → "Call Branch" | Call branch |
| Call Employee | `/communications/calls` → Select employee → "Call" | Call employee |
| History | `/communications/calls` → "Call History" tab | View call history |

---

## 🔍 Verification Checklist

### After Enrollment

**Admin should verify:**
- ✅ Device appears in device list
- ✅ Device status shows "Online" (green dot)
- ✅ Last seen time is recent (< 2 minutes)
- ✅ Enrollment code status changed to "Used"
- ✅ Correct branch linked

**Branch staff should verify:**
- ✅ "Call VMS Team" button is visible
- ✅ Branch name displayed correctly
- ✅ Service status shows "Online" (green)
- ✅ Can click call button without errors

**Test call:**
1. Branch clicks "Call VMS Team"
2. Operator sees incoming call
3. Operator accepts
4. Audio connects on both sides
5. Both can hear each other
6. Call duration timer shows
7. End call works properly

---

## 🐛 Common Issues & Solutions

### Issue 1: "Invalid enrollment code"

**Possible causes:**
- Code expired (24 hours)
- Code already used
- Code was revoked
- Typo in code

**Solution:**
1. Contact admin for new code
2. Verify code carefully (no extra spaces)
3. Check expiration time
4. Try copying and pasting code

---

### Issue 2: Device enrolled but shows offline

**Possible causes:**
- Page not open/refreshed
- Network connection lost
- Heartbeat not sending
- Browser tab inactive/sleeping

**Solution:**
1. Keep browser tab active and open
2. Refresh the page
3. Check internet connection
4. Disable browser tab sleeping/hibernation
5. Check console for errors (F12)

---

### Issue 3: Cannot see "Link Employee" option

**Possible causes:**
- Wrong permission level
- Device list not loaded
- UI not updated

**Solution:**
1. Verify admin permissions
2. Refresh device management page
3. Check browser console for errors
4. Verify device appears in list

---

### Issue 4: Employee not showing in dropdown

**Possible causes:**
- Employee not in same branch
- Employee record not synced
- Database issue

**Solution:**
1. Verify employee branch matches device branch
2. Check employee directory (/communications/directory/employees)
3. Contact IT if employee missing
4. Check database directly if needed

---

## 💾 Database Direct Access (IT Only)

If UI not working, admin/IT can use SQL:

### Check Enrollment Codes
```sql
SELECT 
  code_id,
  code,
  branch_id,
  status,
  expires_at,
  created_at
FROM comm_enrollment_codes
WHERE status = 'active'
  AND expires_at > NOW()
ORDER BY created_at DESC;
```

### Check Enrolled Devices
```sql
SELECT 
  device_id,
  device_name,
  branch_id,
  last_seen_at,
  enrolled_at,
  linked_employee_ids
FROM comm_devices
WHERE branch_id = 'YOUR_BRANCH_ID'
ORDER BY enrolled_at DESC;
```

### Link Employee to Device (Manual)
```sql
UPDATE comm_devices
SET linked_employee_ids = array_append(linked_employee_ids, 'EMPLOYEE_ID')
WHERE device_id = 'DEVICE_ID';
```

### Revoke Device
```sql
UPDATE comm_devices
SET revoked_at = NOW()
WHERE device_id = 'DEVICE_ID';
```

---

## 📞 Support Contact

**For enrollment issues:**
- Contact: IT Department
- Email: it-support@yourdomain.com
- Phone: [Support number]

**For technical issues:**
- Check server logs
- Check browser console (F12)
- Review database directly
- Contact system administrator

---

## 📚 Related Documentation

- `KRYPTOVISION_CONNECT_QUICK_START.md` — User guide
- `KRYPTOVISION_CONNECT_COMPLETE_SUMMARY.md` — Complete overview
- `KRYPTOVISION_CONNECT_DEPLOYMENT.md` — Deployment guide
- `KRYPTOVISION_CONNECT_FRONTEND_INTEGRATION.md` — Frontend integration

---

**Last Updated:** December 2024  
**Status:** Production Ready ✅  
**Language:** Malayalam + English

