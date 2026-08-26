# Starting Local Services for Live Camera Feed

## Problem
The error "Live feed unavailable - The media gateway is unavailable" occurs because:
- The Render-hosted media gateway is sleeping (free tier spins down)
- No edge agent is running to push camera frames
- The snapshot-relay endpoint has no frames in cache

## Solution: Start Local Services

### Step 1: Start Edge Agent (includes media gateway on port 8090)

The edge agent includes the media gateway functionality and will:
- Connect to your cameras (DVR/NVR or direct IP cameras)
- Push frames to the snapshot-relay endpoint
- Serve live HLS/WebRTC streams on port 8090

```bash
# Open a terminal and navigate to edge-agent folder
cd edge-agent

# Install dependencies (if not done)
npm install

# Start the edge agent in development mode
npm run dev
```

The edge agent will start the media gateway on **http://localhost:8090**

### Step 2: Verify Edge Agent Configuration

Check the edge agent's configuration file. Create `.env` file in the edge-agent folder if it doesn't exist:

```env
# Control Plane
CONTROL_PLANE_URL=https://sentinel-grid-control-plane-zcli.onrender.com
CONTROL_PLANE_SHARED_TOKEN=348b3a216fa3db721dc48c69953da0c66e4d89c64d14e6c182a737b07c3fce3d

# Edge Bridge
EDGE_BRIDGE_SHARED_KEY=WBRrQzol9gGTuIEAVd08kvMFP5pfyNDj1m32qZ7YsShOcxHa

# Media Gateway
EDGE_LIVE_GATEWAY_HOST=0.0.0.0
EDGE_LIVE_GATEWAY_PORT=8090
EDGE_MANAGED_MEDIA_BOOTSTRAP=true
MEDIA_RUNTIME_MANAGED=true

# Database (same as control plane)
DATABASE_URL=postgresql://aditivision_4gc4_user:vVZ8yzf7dRV7VIyOeQ6MmSQR9nHMifqa@dpg-da37mgbncjis73c09tpg-a.oregon-postgres.render.com/aditivision_4gc4
```

### Step 3: Start Control Plane (Backend)

```bash
# Open another terminal in the root directory
cd c:\Omsystems

# Install dependencies (if not done)
npm install

# Start the control plane server
npm run dev
```

The control plane will start on **http://localhost:8080**

### Step 4: Start Dashboard (Frontend)

```bash
# Open another terminal
cd dashboard

# Install dependencies (if not done)
npm install

# Start the dashboard
npm run dev
```

The dashboard will start on **http://localhost:3000**

### Step 5: Verify Services are Running

1. **Control Plane**: http://localhost:8080/health
2. **Edge Agent Media Gateway**: http://localhost:8090/health
3. **Dashboard**: http://localhost:3000

## Environment Configuration

The `.env` file has been updated to use local services:

```env
# Media Gateway - LOCAL
MEDIA_GATEWAY_INTERNAL_URL=http://localhost:8090
MEDIA_GATEWAY_LOCAL_URL=http://localhost:8090
```

## Camera Configuration

Make sure your cameras are:
1. **Registered in the database** (9 cameras should be present)
2. **Have valid connection credentials**
3. **Are accessible from the edge agent** (network connectivity)
4. **Have assigned edge agent ID** (links camera to edge agent)

## Troubleshooting

### Camera Frames Not Showing

1. Check edge agent logs for connection errors
2. Verify camera credentials in database
3. Check network connectivity to cameras
4. Ensure DVR/NVR is online and accessible

### Media Gateway Unreachable

1. Verify port 8090 is not blocked by firewall
2. Check edge agent is running (`npm run dev` in edge-agent folder)
3. Look for errors in edge agent terminal output

### Database Connection Issues

1. Verify DATABASE_URL is correct in all .env files
2. Check network connectivity to Render PostgreSQL
3. Confirm database contains camera records

## Alternative: Use Demo Mode

If you want to test without actual cameras, enable demo mode:

```env
DASHBOARD_DEMO_MODE=true
```

This will show simulated camera feeds for testing the UI.

## Production Deployment

For production, ensure:
1. All services are deployed and running on Render
2. Media gateway is on a paid plan (won't sleep)
3. Edge agent is installed on-premises and connecting to cameras
4. Environment variables point to production URLs
