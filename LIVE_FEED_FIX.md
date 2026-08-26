# Live Feed Fix - "Media Gateway Unavailable" Error

## 🔴 Problem
You're seeing **"Live feed unavailable - The media gateway is unavailable"** because:

1. **Media Gateway on Render is sleeping** - Free tier services spin down after inactivity
2. **No edge agent is running** - No service is capturing and pushing camera frames
3. **Snapshot-relay cache is empty** - The `/api/media/snapshot-relay` endpoint has no frames

## ✅ Solution Options

### Option 1: Quick Start with PowerShell Script (Recommended)

Run the automated startup script:

```powershell
.\start-local.ps1
```

This will start all three required services in separate terminal windows:
- **Control Plane** (port 8080)
- **Edge Agent/Media Gateway** (port 8090)  
- **Dashboard** (port 3000)

### Option 2: Manual Start (Step-by-Step)

#### Step 1: Start Control Plane
```bash
# Terminal 1 - Root directory
npm install
npm run dev
```

#### Step 2: Start Edge Agent (includes Media Gateway)
```bash
# Terminal 2 - Edge agent directory
cd edge-agent
npm install
npm run dev
```

#### Step 3: Start Dashboard
```bash
# Terminal 3 - Dashboard directory
cd dashboard
npm install
npm run dev
```

### Option 3: Use Render Services (Production)

If you want to use the hosted Render services:

1. **Log into Render.com**
2. **Navigate to the media gateway service**
3. **Click "Manual Deploy"** or **restart the service** to wake it up
4. **Revert .env changes**:
   ```env
   MEDIA_GATEWAY_INTERNAL_URL=https://sentinel-grid-media-gateway-ogqi.onrender.com
   ```

## 📋 Verification Steps

After starting services, verify they're running:

1. **Control Plane Health**: 
   - Open http://localhost:8080/health
   - Should return `{"status":"ok"}`

2. **Media Gateway Health**: 
   - Open http://localhost:8090/health
   - Should return `{"status":"ok","service":"sentinel-edge-media-gateway"}`

3. **Dashboard**: 
   - Open http://localhost:3000
   - Login with your credentials
   - Navigate to Operations > Live View
   - Camera feeds should now appear

## 🎥 Camera Requirements

For cameras to appear in the live feed:

1. **Cameras must be registered in the database** (you have 9 cameras)
2. **Cameras must have valid credentials** (DVR username/password)
3. **Network connectivity** from edge agent to cameras
4. **Edge agent must be assigned to cameras** in the database

## 🔧 Configuration Changes Made

The following file was updated for local development:

**`.env` (root directory)**
```env
# Changed from Render URL to local
MEDIA_GATEWAY_INTERNAL_URL=http://localhost:8090
MEDIA_GATEWAY_LOCAL_URL=http://localhost:8090
```

## 📝 Architecture Overview

```
┌─────────────────┐
│   Dashboard     │  Port 3000
│  (Next.js UI)   │
└────────┬────────┘
         │ HTTP
         ▼
┌─────────────────┐
│ Control Plane   │  Port 8080
│   (Backend)     │
└────────┬────────┘
         │ HTTP
         ▼
┌─────────────────┐
│  Edge Agent     │  Port 8090
│ (Media Gateway) │
└────────┬────────┘
         │ RTSP/ONVIF
         ▼
┌─────────────────┐
│   Cameras       │
│  (DVR/NVR/IP)   │
└─────────────────┘
```

## 🐛 Troubleshooting

### "Port already in use" errors

Kill processes on required ports:
```powershell
# Find and kill process on port 8080
netstat -ano | findstr :8080
taskkill /PID <PID> /F

# Or use npx kill-port
npx kill-port 8080 8090 3000
```

### "Database connection failed"

Check your DATABASE_URL in .env:
```env
DATABASE_URL=postgresql://aditivision_4gc4_user:vVZ8yzf7dRV7VIyOeQ6MmSQR9nHMifqa@dpg-da37mgbncjis73c09tpg-a.oregon-postgres.render.com/aditivision_4gc4
```

### "No cameras found"

1. Check database has camera records:
   ```sql
   SELECT id, name, status FROM cameras;
   ```

2. Verify cameras have edge_agent_id assigned

3. Check edge agent logs for connection errors

### Camera feeds still not showing

1. **Check edge agent is connecting to cameras**
   - Look for connection errors in edge agent terminal
   - Verify camera IP addresses and credentials
   - Test camera connectivity: `ping <camera-ip>`

2. **Verify frames are being pushed**
   - Check dashboard network tab for `/api/media/snapshot-relay` requests
   - Edge agent should POST frames every ~1 second

3. **Clear browser cache and reload**

## 🎯 Next Steps

1. **Start services** using the PowerShell script
2. **Verify all health endpoints** are responding
3. **Login to dashboard** and navigate to Operations > Live View
4. **Check camera tiles** for live feeds

## 📚 Additional Resources

- **Full Setup Guide**: `START_LOCAL_SERVICES.md`
- **Edge Agent Config**: `edge-agent/.env.example`
- **Dashboard API Routes**: `dashboard/app/api/`

## 💡 Tips

- Keep all three terminal windows open while developing
- Use Ctrl+C to stop each service gracefully
- Monitor edge agent logs for camera connection status
- Enable debug logging for more details: `LOG_LEVEL=debug`

---

**Need help?** Check the logs in each terminal window for specific error messages.
