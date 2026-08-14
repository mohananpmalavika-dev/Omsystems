# Test Your TrueCloud QR Code

## Quick Test Instructions

### Test 1: Online Decoder (Easiest)
1. Open https://webqr.com in your browser
2. Click "Upload" 
3. Select your QR code screenshot
4. **Expected**: You should see decoded text with credentials
5. **Look for**: `user`, `username`, `pwd`, `password` fields

### Test 2: Dashboard Feature (Tests Our Implementation)
```bash
# Start dashboard
cd dashboard
npm run dev
```

Then:
1. **Navigate**: http://localhost:3000/admin/branch-onboarding
2. **Login**: Use your admin credentials
3. **Select Branch**: Choose any branch
4. **Scan**: Click "Scan cameras"
5. **Wait**: For camera discovery
6. **Click**: "Enter login & password" on discovered camera
7. **NEW FEATURE**: Click "Scan or Upload QR Code" button
8. **Upload**: Select your QR screenshot
9. **Verify**: Username and password auto-fill
10. **Success**: If credentials appear, feature works! ✅

### Test 3: Try Default Credentials Directly

Skip QR scanning and try these in the camera login form:

**Attempt 1**:
- Username: `admin`
- Password: `admin`

**Attempt 2**:
- Username: `admin`  
- Password: `12345`

**Attempt 3**:
- Username: `admin`
- Password: `592944` (last 6 digits of your Device ID)

**Attempt 4**:
- Username: `admin`
- Password: `888888`

### Test 4: CLI Script

```bash
# Install dependencies
npm install jimp qrcode-reader

# Save your QR image as 'qr-code.jpg' in project root

# Run decoder
node test-qr-decode.mjs qr-code.jpg
```

Expected output:
```
✅ QR Code Decoded Successfully!
═══════════════════════════════════════════════════════
Raw QR Data:
[decoded QR content here]
═══════════════════════════════════════════════════════
🔐 Extracted Credentials:
Username: [username]
Password: [password]
```

## What Your QR Code Likely Contains

Based on TrueCloud camera format, the QR code probably has:

**Format Option 1 - JSON**:
```json
{
  "id": "4835592944",
  "user": "admin",
  "pwd": "XXXXX",
  "ip": "192.168.1.x",
  "mac": "XX:XX:XX:XX:XX:XX"
}
```

**Format Option 2 - Key-Value**:
```
ID:4835592944;USER:admin;PWD:XXXXX;IP:192.168.1.x
```

**Format Option 3 - URL**:
```
truecloud://device?id=4835592944&user=admin&pwd=XXXXX
```

## Success Criteria

✅ **Test Passes If**:
- QR decodes successfully
- Username extracted
- Password extracted  
- Credentials auto-fill in form
- Camera connects with extracted credentials

❌ **Test Fails If**:
- QR doesn't decode
- No credentials found in QR
- Wrong credentials extracted
- Camera rejects credentials

## Troubleshooting

### QR Decodes But No Credentials Found

**Reason**: QR might only contain device info, not login credentials

**Solution**: 
1. Check camera documentation
2. Try default credentials above
3. Contact TrueCloud support with Device ID: 4835592944

### QR Doesn't Decode At All

**Reason**: Image quality issues

**Solutions**:
1. Take a clearer photo of the QR code
2. Ensure good lighting
3. Take photo straight-on (not at angle)
4. Try scanning with phone first

### Feature Works But Camera Still Rejects Login

**Reason**: Credentials might have been changed from defaults

**Solutions**:
1. Check if camera was previously configured
2. Try factory reset on camera
3. Use TrueCloud app to reset password
4. Contact camera vendor support

## Expected Test Results

### Scenario A: QR Contains Credentials
```
✅ QR decodes successfully
✅ Username found: admin
✅ Password found: [actual password]
✅ Camera accepts credentials
✅ Feature works perfectly!
```

### Scenario B: QR Contains Only Device Info
```
✅ QR decodes successfully
❌ No username found in QR
❌ No password found in QR
⚠️  Need to try default credentials manually
```

### Scenario C: QR Format Not Recognized
```
✅ QR decodes successfully
❌ Format not recognized by parser
⚠️  Need to check raw decoded text
⚠️  May need to add new format parser
```

## Next Steps Based on Results

### If Test Succeeds ✅
1. Document actual QR format used
2. Add to format examples
3. Deploy to production
4. Train users on feature

### If QR Has No Credentials ⚠️
1. Document that TrueCloud QR doesn't include password
2. Update UI to show "Try default credentials" 
3. Add default credential suggestions to form
4. Still useful for device ID extraction

### If Test Fails ❌
1. Share decoded QR text (mask password)
2. We'll add support for that format
3. Update parser logic
4. Re-test

## Share Your Results

After testing, let me know:

1. **Did QR decode successfully?** Yes/No
2. **What format was it?** JSON/Key-Value/URL/Other
3. **Were credentials found?** Yes/No
4. **Did camera accept them?** Yes/No
5. **Any errors?** Describe

This helps us verify the implementation works with real TrueCloud cameras!

---

**Ready to test?** Start with Option 1 (webqr.com) - fastest way!
