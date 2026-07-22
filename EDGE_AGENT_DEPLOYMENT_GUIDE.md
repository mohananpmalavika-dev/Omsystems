# Edge Agent Deployment Guide

The Edge Agent runs on-premises at your branch location to discover and manage cameras on your local network.

## Prerequisites

- **Node.js 22+** installed on the deployment machine
- Machine must be on the **same network** as your cameras
- Network access to your cameras (typically port 80/8080 for ONVIF, 554 for RTSP)
- Internet access to reach the Control Plane: `https://sentinel-grid-control-plane.onrender.com`

## Deployment Options

### Option 1: Run Locally (Development/Testing)

1. **Navigate to edge-agent directory:**
   ```bash
   cd edge-agent
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create `.env` file** (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

4. **Edit `.env` file** with your settings:
   ```env
   CONTROL_PLANE_URL=https://sentinel-grid-control-plane.onrender.com
   BRANCH_ID=your-branch-id-here
   EDGE_AGENT_NAME=My Branch Gateway
   EDGE_AGENT_VERSION=0.1.0
   DEV_USER_ID=user-global-admin
   CAMERA_USERNAME=admin
   CAMERA_PASSWORD=your-camera-password
   EDGE_BRIDGE_SHARED_KEY=r6PVPlqWnhiFwLCno7CK39pfJM1BtFIIUOWpQgVqDDY=
   DISCOVERY_TIMEOUT_MS=5000
   ONVIF_TIMEOUT_MS=8000
   ```

5. **Find your Branch ID:**
   - Go to your dashboard: https://sentinel-grid-monitoring.onrender.com/admin
   - Look at the branch dropdown or inspect the network requests
   - OR use the database to find it

6. **Start the Edge Agent:**
   ```bash
   npm run dev
   ```

### Option 2: Docker Deployment (Recommended for Production)

1. **Create `docker-compose.yml`:**
   ```yaml
   version: '3.8'
   services:
     edge-agent:
       build:
         context: .
         dockerfile: edge-agent/Dockerfile
       container_name: sentinel-edge-agent
       restart: unless-stopped
       network_mode: host  # Required to discover cameras on local network
       environment:
         - CONTROL_PLANE_URL=https://sentinel-grid-control-plane.onrender.com
         - BRANCH_ID=your-branch-id-here
         - EDGE_AGENT_NAME=My Branch Gateway
         - EDGE_BRIDGE_SHARED_KEY=r6PVPlqWnhiFwLCno7CK39pfJM1BtFIIUOWpQgVqDDY=
         - CAMERA_USERNAME=admin
         - CAMERA_PASSWORD=your-camera-password
       volumes:
         - ./logs:/app/logs
   ```

2. **Build and run:**
   ```bash
   docker-compose up -d
   ```

3. **Check logs:**
   ```bash
   docker-compose logs -f edge-agent
   ```

### Option 3: Standalone Docker

```bash
docker build -t sentinel-edge-agent -f edge-agent/Dockerfile .

docker run -d \
  --name sentinel-edge-agent \
  --network host \
  --restart unless-stopped \
  -e CONTROL_PLANE_URL=https://sentinel-grid-control-plane.onrender.com \
  -e BRANCH_ID=your-branch-id-here \
  -e EDGE_AGENT_NAME="My Branch Gateway" \
  -e EDGE_BRIDGE_SHARED_KEY=r6PVPlqWnhiFwLCno7CK39pfJM1BtFIIUOWpQgVqDDY= \
  -e CAMERA_USERNAME=admin \
  -e CAMERA_PASSWORD=your-password \
  sentinel-edge-agent
```

## Configuration Parameters

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `CONTROL_PLANE_URL` | Yes | URL to your control plane | `https://sentinel-grid-control-plane.onrender.com` |
| `BRANCH_ID` | Yes | UUID of the branch this agent serves | `branch-blr-001` |
| `EDGE_AGENT_NAME` | Yes | Human-readable name for this gateway | `Mumbai Office Gateway` |
| `EDGE_BRIDGE_SHARED_KEY` | Yes | Authentication key (from deployment) | `r6PVPlqWnhiFwLCno7CK39pfJM1BtFIIUOWpQgVqDDY=` |
| `CAMERA_USERNAME` | Yes | Default username for camera discovery | `admin` |
| `CAMERA_PASSWORD` | Yes | Default password for camera discovery | (your camera password) |
| `DEV_USER_ID` | No | User ID for dev mode | `user-global-admin` |
| `DISCOVERY_TIMEOUT_MS` | No | Network discovery timeout | `5000` |
| `ONVIF_TIMEOUT_MS` | No | ONVIF request timeout | `8000` |

## How to Get Your Branch ID

### Method 1: From the Dashboard
1. Go to: https://sentinel-grid-monitoring.onrender.com/admin
2. Open browser DevTools (F12)
3. Go to Network tab
4. Click on "Branch cameras" tab
5. Look for API calls - the URL will contain the branch ID
6. Example: `/api/branches/abc-123-def/cameras` → Branch ID is `abc-123-def`

### Method 2: From Database (if you have access)
```sql
SELECT id, name FROM resource_nodes WHERE type = 'branch';
```

### Method 3: Create a New Branch via API
```bash
curl -X POST https://sentinel-grid-control-plane.onrender.com/v1/branches \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Branch Office",
    "location": "City, Country"
  }'
```

## Verification

Once the edge agent is running:

1. **Check logs** for successful connection:
   ```
   ✓ Connected to control plane
   ✓ Edge agent registered
   ✓ Starting camera discovery...
   ```

2. **In the dashboard:**
   - Go to Admin → Branch cameras
   - Select your branch
   - You should see "Branch gateways: 1 registered"
   - The "Scan network" button should now be **enabled**

3. **Test camera discovery:**
   - Click "Scan network"
   - Wait for the scan to complete
   - Discovered cameras will appear in the "Camera inventory" section

## Troubleshooting

### "Connection refused" error
- Check if `CONTROL_PLANE_URL` is correct
- Verify internet connectivity
- Check if port 443 (HTTPS) is not blocked by firewall

### "Authentication failed" error
- Verify `EDGE_BRIDGE_SHARED_KEY` matches the control plane
- Key should be: `r6PVPlqWnhiFwLCno7CK39pfJM1BtFIIUOWpQgVqDDY=`

### No cameras discovered
- Ensure the edge agent machine is on the same network as cameras
- Verify camera ONVIF port (usually 80 or 8080) is accessible
- Check `CAMERA_USERNAME` and `CAMERA_PASSWORD` are correct
- Some cameras require ONVIF to be explicitly enabled in settings

### "Branch not found" error
- Verify `BRANCH_ID` exists in the system
- Branch must be created before registering an edge agent

## Production Deployment Tips

1. **Use systemd** (Linux) or Windows Service to ensure the agent starts on boot
2. **Monitor logs** and set up alerts for connection failures
3. **Secure credentials**: Use environment files with restricted permissions
4. **Network security**: Consider VPN or firewall rules for control plane access
5. **Updates**: Rebuild and redeploy when new versions are released

## Windows Service Setup

Create a `install-service.ps1`:
```powershell
# Install as Windows Service using NSSM
nssm install SentinelEdgeAgent "C:\Program Files\nodejs\node.exe"
nssm set SentinelEdgeAgent AppDirectory "C:\path\to\edge-agent"
nssm set SentinelEdgeAgent AppParameters "dist\index.js"
nssm set SentinelEdgeAgent AppEnvironmentExtra CONTROL_PLANE_URL=https://sentinel-grid-control-plane.onrender.com
nssm start SentinelEdgeAgent
```

## Linux systemd Service

Create `/etc/systemd/system/sentinel-edge-agent.service`:
```ini
[Unit]
Description=Sentinel Edge Agent
After=network.target

[Service]
Type=simple
User=sentinel
WorkingDirectory=/opt/sentinel/edge-agent
EnvironmentFile=/opt/sentinel/edge-agent/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable sentinel-edge-agent
sudo systemctl start sentinel-edge-agent
sudo systemctl status sentinel-edge-agent
```

## Next Steps

After deploying the edge agent:
1. Verify it's registered in the dashboard
2. Use "Scan network" to discover cameras
3. Approve discovered cameras
4. Configure camera settings and permissions
5. Test live streaming

## Support

For issues or questions:
- Check the edge agent logs
- Check control plane logs in Render dashboard
- Review network connectivity between edge agent and cameras
- Verify all environment variables are correctly set
