# Media Gateway Architecture Explained

## Overview

Your system has **TWO media gateways**, each serving a different purpose:

---

## 1. Cloud Media Gateway (Render)

**URL:** `https://sentinel-grid-media-gateway1.onrender.com`  
**Location:** Render cloud (US/Singapore servers)  
**Purpose:** Stream cameras that are accessible over the internet

### Architecture
```
Internet Camera (public IP)
        ↓
Cloud Media Gateway (Render)
        ↓
Dashboard (Render or local)
```

### Use Cases
- Cameras with public IP addresses
- Cameras accessible via port forwarding
- Cloud-hosted cameras
- IoT cameras with internet connectivity

### Why It Doesn't Work for Your Setup
❌ Your cameras are on local network (192.168.29.x)  
❌ The Render gateway is in the cloud and **cannot reach local network**  
❌ No VPN or network path from Render to your home network

---

## 2. Edge Media Gateway (Your PC)

**Local URL:** `http://127.0.0.1:8090`  
**Public URL:** `https://apnic-deserve-evans-yarn.trycloudflare.com`  
**Location:** Your local PC  
**Purpose:** Stream LOCAL cameras on your network

### Architecture
```
Local Camera (192.168.29.x)
        ↓
Edge Agent on Your PC (127.0.0.1:8090)
        ↓
Cloudflare Tunnel
        ↓
Public Internet (https://apnic-deserve-evans-yarn.trycloudflare.com)
        ↓
Dashboard (Render or anywhere)
```

### Use Cases
- Local network cameras (like yours!)
- Private networks
- Home/office security systems
- Cameras without public IPs

### Why This Works
✅ Edge agent runs on your PC  
✅ Your PC is on the same network as cameras  
✅ Cloudflare tunnel exposes it publicly  
✅ Dashboard can access via tunnel URL

---

## Comparison Table

| Feature | Cloud Gateway (Render) | Edge Gateway (Your PC) |
|---------|------------------------|------------------------|
| **URL** | sentinel-grid-media-gateway1.onrender.com | apnic-deserve-evans-yarn.trycloudflare.com |
| **Location** | Cloud (Render) | Your PC |
| **Can reach local cameras?** | ❌ No | ✅ Yes |
| **Can reach internet cameras?** | ✅ Yes | ✅ Yes |
| **Always online?** | ✅ Yes (Render) | ⚠️ Only when PC is on |
| **Fixed URL?** | ✅ Yes | ❌ Quick tunnel changes |
| **Use case** | Internet cameras | Local cameras |

---

## Your Current Setup (Correct for Local Cameras)

```
┌─────────────────────────────────────────────────────────────┐
│ Your Home Network (192.168.29.x)                            │
│                                                              │
│  ┌─────────────┐                ┌─────────────────────┐    │
│  │   Camera    │──ONVIF/RTSP───▶│   Your PC           │    │
│  │ 192.168.x.x │                │                     │    │
│  └─────────────┘                │  Edge Agent :8090   │    │
│                                  │  MediaMTX :8888     │    │
│                                  │  cloudflared        │    │
│                                  └──────────┬──────────┘    │
└─────────────────────────────────────────────┼──────────────┘
                                              │
                                              │ Cloudflare Tunnel
                                              ▼
                               https://apnic-deserve-evans-yarn
                                    .trycloudflare.com
                                              │
                     ┌────────────────────────┼────────────────────────┐
                     │                        │                        │
                     ▼                        ▼                        ▼
           Dashboard (Render)      Dashboard (Local)         Mobile App
     sentinel-grid-monitoring1    localhost:3000
```

---

## Configuration Summary

### ✅ CORRECT Configuration (Your Setup)

**Control Plane (.env):**
```env
# Control plane knows about BOTH gateways
MEDIA_GATEWAY_INTERNAL_URL=https://sentinel-grid-media-gateway1.onrender.com
```

**Edge Agent (.env):**
```env
# Edge agent exposes itself via tunnel
PUBLIC_MEDIA_GATEWAY_URL=https://apnic-deserve-evans-yarn.trycloudflare.com
EDGE_BRIDGE_SHARED_KEY=WBRrQzol9gGTuIEAVd08kvMFP5pfyNDj1m32qZ7YsShOcxHa
```

**Dashboard on Render (Environment Variable):**
```env
# Dashboard should use edge agent for local cameras
MEDIA_GATEWAY_INTERNAL_URL=https://apnic-deserve-evans-yarn.trycloudflare.com

# OR use control plane to route automatically
CONTROL_PLANE_INTERNAL_URL=https://sentinel-grid-control-plane1.onrender.com
```

---

## How Live Streaming Works

### Flow for Your Local Cameras

1. **User clicks "Watch Live" in dashboard**
   ```
   Dashboard → Control Plane: "Start live session for camera X"
   ```

2. **Control plane checks which gateway to use**
   ```
   Control Plane: "Camera X is managed by edge agent Y"
   Control Plane: "Edge agent Y public URL: https://apnic-deserve-evans-yarn.trycloudflare.com"
   ```

3. **Control plane creates live session**
   ```
   Control Plane → Edge Agent (via tunnel): "Create stream for camera X"
   Edge Agent → MediaMTX: "Start proxying RTSP from camera"
   MediaMTX → Camera: Connect to rtsp://192.168.x.x:554
   ```

4. **Dashboard receives stream URL**
   ```
   Control Plane → Dashboard: {
     "hlsUrl": "https://apnic-deserve-evans-yarn.trycloudflare.com/hls/abc123/index.m3u8",
     "token": "secret-token-xyz"
   }
   ```

5. **Dashboard plays video**
   ```
   Browser → Cloudflare Tunnel → Edge Agent → MediaMTX → Camera
   ```

---

## Migration Path (Future)

### Current: Quick Tunnel
- ⚠️ URL changes on restart
- Manual update needed

### Next: Named Tunnel (Recommended)
```
https://edge.yourdomain.com (permanent)
```

### Future: Multiple Edge Agents
```
Site A: https://edge-site-a.yourdomain.com
Site B: https://edge-site-b.yourdomain.com
Site C: https://edge-site-c.yourdomain.com
```

---

## Summary

**For your local cameras:**
- ✅ Use Edge Gateway via Cloudflare tunnel
- ✅ Update Render dashboard: `MEDIA_GATEWAY_INTERNAL_URL=https://apnic-deserve-evans-yarn.trycloudflare.com`
- ❌ Don't use the Render media gateway (it can't reach local cameras)

**The Render media gateway is not useless:**
- It's for future internet-accessible cameras
- It's for branch offices with public IPs
- It's for cloud-hosted cameras

**Your setup is correct now!** Just update the Render dashboard environment variable.

---

Created: August 1, 2026
