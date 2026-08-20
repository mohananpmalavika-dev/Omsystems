# Real Camera Discovery - Simple Solution

## Current Problem

When you click "Scan cameras" in Branch Onboarding:

1. ✅ Creates EdgeScanJob in database
2. ❌ **But actual ONVIF scanning doesn't happen**
3. ❌ Edge agent would need to pick up job and scan network
4. ❌ Without real edge agent running, discovered_cameras table stays empty
5. ❌ UI shows "No pending discoveries"

## Why It Doesn't Work

The architecture expects:
```
Control Plane → Creates Job → Edge Agent picks up → Scans network → Reports back discoveries
```

But you're running Control Plane only, without Edge Agent.

## Simple Solutions

### Option 1: Use the Batch File Auto-Setup ✅ RECOMMENDED

This is the easiest way to get real camera discovery working:

1. **Download Auto-Setup Batch File**
   ```
   Branch Onboarding → Select Branch → Download Auto-Setup (.BAT)
   ```

2. **Run the Batch File on Your PC**
   - Double-click the `.BAT` file
   - It will:
     - Register as edge agent
     - Scan your network: `192.168.x.x`
     - Find ONVIF cameras
     - Report discoveries to Control Plane
     - Keep heartbeat running

3. **Refresh Browser**
   - Discovered cameras will appear
   - You can approve them

**Advantages:**
- ✅ Works with real network cameras
- ✅ Actual ONVIF WS-Discovery  
- ✅ No code changes needed
- ✅ Production-ready

### Option 2: Direct IP Camera Probe ✅ QUICK TEST

For testing a single camera:

1. Click "Direct IP Probe" button
2. Enter camera IP (e.g., `192.168.29.196`)
3. Enter RTSP port (usually `554`)
4. Enter password if needed
5. Click "Probe"
6. If camera responds, click "Enroll"

**Advantages:**
- ✅ Fast testing
- ✅ Works for single camera
- ✅ No agent installation

### Option 3: Manual Camera Registration

If you know camera details:

1. Get camera IP, model, etc.
2. Use "Advanced device inventory" section
3. Add camera manually
4. Configure RTSP stream URLs

**Advantages:**
- ✅ Complete control
- ✅ Works offline
- ✅ Good for testing

### Option 4: Simulate Edge Agent Locally 🔧 DEVELOPER

For development, create a simple Node.js script:

```typescript
// simulate-edge-agent.ts
import dgram from 'dgram';

async function onvifDiscovery() {
  const socket = dgram.createSocket('udp4');
  const devices: any[] = [];

  socket.on('message', (msg, rinfo) => {
    const xml = msg.toString();
    if (xml.includes('ProbeMatch')) {
      console.log(`Found device at ${rinfo.address}`);
      devices.push({
        ipAddress: rinfo.address,
        manufacturer: 'ONVIF Device',
        // ... parse XML for more details
      });
    }
  });

  socket.bind(3702, () => {
    socket.addMembership('239.255.255.250');
    
    // Send ONVIF probe
    const probe = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body>
    <d:Probe xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery">
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </s:Body>
</s:Envelope>`;

    socket.send(probe, 3702, '239.255.255.250');
  });

  // Wait for responses
  await new Promise(resolve => setTimeout(resolve, 10000));
  socket.close();
  
  return devices;
}

// Post discoveries to Control Plane
async function reportDiscoveries(branchId: string, devices: any[]) {
  for (const device of devices) {
    await fetch(`http://localhost:3001/v1/branches/${branchId}/cameras/discovered`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        edgeAgentId: 'local-dev-agent',
        ipAddress: device.ipAddress,
        manufacturer: device.manufacturer,
        // ... more fields
      })
    });
  }
}

// Run
const branchId = 'your-branch-id';
const devices = await onvifDiscovery();
await reportDiscoveries(branchId, devices);
```

Run this script to scan your network and report discoveries.

## Network Requirements

For real ONVIF discovery to work:

1. **Multicast must be enabled**
   - UDP port 3702
   - Multicast address 239.255.255.250

2. **Cameras must support ONVIF**
   - Check camera specifications
   - Enable ONVIF in camera settings

3. **Network accessibility**
   - PC and cameras on same subnet
   - No firewall blocking multicast
   - Router allows IGMP/multicast

## Testing Your Network

### Check if cameras are ONVIF-enabled:

```powershell
# Windows - Test ONVIF multicast
$socket = New-Object System.Net.Sockets.UdpClient
$socket.Client.SetSocketOption([System.Net.Sockets.SocketOptionLevel]::Socket, [System.Net.Sockets.SocketOptionName]::ReuseAddress, $true)
$multicastIP = [System.Net.IPAddress]::Parse("239.255.255.250")
$socket.JoinMulticastGroup($multicastIP)
$socket.Client.Bind((New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 3702)))

Write-Host "Listening for ONVIF devices..."
# Devices should respond to ONVIF probe on this multicast group
```

### Check if camera is reachable:

```powershell
# Ping camera
ping 192.168.29.196

# Test RTSP port
Test-NetConnection -ComputerName 192.168.29.196 -Port 554

# Test ONVIF port
Test-NetConnection -ComputerName 192.168.29.196 -Port 80
```

## Recommended Workflow

For your case, I recommend:

### 1. Download and Run Auto-Setup Batch File (5 minutes)

```
1. Open Branch Onboarding
2. Select your branch
3. Click "Download Auto-Setup (.BAT)"
4. Double-click the downloaded file
5. Let it run (keeps scanning)
6. Refresh browser
7. Cameras appear!
```

This will:
- ✅ Register edge agent
- ✅ Scan your actual network (192.168.x.x)
- ✅ Find all ONVIF cameras
- ✅ Report to Control Plane
- ✅ Show in UI immediately

### 2. If Batch File Doesn't Work

Use Direct IP Probe for each camera:
```
1. Get camera IP from router
2. Click "Direct IP Probe"
3. Enter IP: 192.168.29.196
4. Test connection
5. If works, click "Enroll"
```

### 3. For Quick Testing Without Network

If you just want to test the UI flow without real cameras, I can add a **"Generate Test Discoveries"** button that creates sample entries in the database.

## What I Can Do Right Now

I can create any of these:

### A. Add "Generate Test Data" Button
```typescript
// Adds button in UI that calls:
POST /v1/branches/:branchId/test-discoveries
// Creates sample discovered cameras in database
// Good for UI testing without network
```

### B. Create Simple ONVIF Scanner Script
```typescript
// Node.js script you run locally:
npm run scan-network -- --branch=your-branch-id
// Scans actual network and reports discoveries
```

### C. Enhance Batch File
```
// Improve the existing Auto-Setup .BAT
// Make it more robust for your network
```

Which option works best for you?

1. Try Auto-Setup .BAT first (easiest)
2. If not working, use Direct IP Probe
3. If need test data, I'll add test data generator

Let me know!
