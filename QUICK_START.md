# 🚀 QR Scanner Quick Start

## For Users

### How to Use QR Scanner

1. **Navigate**: Go to Admin → Branch Onboarding
2. **Scan**: Click "Scan cameras" button
3. **Login Needed**: Click "Enter login & password" on any camera
4. **QR Option**: Click "**Scan or Upload QR Code**" button
5. **Choose Method**:
   - 📸 **Scan**: Allow camera → Hold QR code in frame
   - 🖼️ **Upload**: Select saved QR image file
6. **Auto-Fill**: Username and password fill automatically
7. **Submit**: Click "Save & verify this device"

### Your Camera Info
- **Device ID**: 4835592944
- **Brand**: TrueCloud
- **Try**: admin/admin, admin/12345, or admin/592944

---

## For Developers

### Files Added
```
dashboard/
├── components/
│   └── qr-credential-scanner.tsx  ← Main component
├── app/
│   ├── api/decode-qr/
│   │   └── route.ts               ← API endpoint
│   ├── layout.tsx                  ← Added jsQR script
│   └── globals.css                 ← Added styles
└── public/
    └── qr-scanner-demo.html        ← Demo page

scripts/
├── decode-camera-qr.mjs            ← CLI tool
└── extract-camera-credentials.mjs  ← Image tool
```

### Quick Deploy
```bash
git add .
git commit -m "Add QR credential scanner"
git push
```

### Test Locally
```bash
cd dashboard
npm run dev
# Open: http://localhost:3000/admin/branch-onboarding
```

### Optional Dependencies
```bash
npm install jimp qrcode-reader
```

---

## Documentation

- 📘 **Full Guide**: `QR_CREDENTIAL_SCANNER_GUIDE.md`
- 📋 **Summary**: `QR_SCANNER_SUMMARY.md`
- ✅ **Complete**: `IMPLEMENTATION_COMPLETE.md`
- 🎥 **Demo**: `dashboard/public/qr-scanner-demo.html`

---

## Support

**Camera not scanning?**
→ Use upload option instead

**No credentials found?**
→ Try default: admin/admin

**Need help?**
→ Check `CAMERA_CREDENTIAL_GUIDE.md`

---

**Status**: ✅ Ready to use!
