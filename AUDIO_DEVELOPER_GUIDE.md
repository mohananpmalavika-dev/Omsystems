# Audio Developer Quick Reference Guide

## Using Talkback in Your UI

### Basic Implementation

```tsx
import { HoldToTalkButton } from "@/components/hold-to-talk-button";

function CameraView({ cameraId }: { cameraId: string }) {
  return (
    <div>
      <video src={liveStreamUrl} />
      
      {/* Add talkback button */}
      <HoldToTalkButton 
        cameraId={cameraId}
        disabled={!cameraSupportsAudio}
        unsupportedReason={!cameraSupportsAudio ? "Camera has no speaker" : undefined}
        onTalkingChange={(talking) => {
          if (talking) {
            console.log("User is talking to camera");
          }
        }}
      />
    </div>
  );
}
```

### Advanced Usage

```tsx
import { useState } from "react";
import { HoldToTalkButton } from "@/components/hold-to-talk-button";

function AdvancedCameraControl({ cameraId, cameraName }: Props) {
  const [isTalking, setIsTalking] = useState(false);
  
  return (
    <div className="camera-controls">
      <h3>{cameraName}</h3>
      
      {isTalking && (
        <div className="alert alert-info">
          🎤 Broadcasting to camera...
        </div>
      )}
      
      <HoldToTalkButton
        cameraId={cameraId}
        onTalkingChange={setIsTalking}
      />
      
      {/* Disable other controls while talking */}
      <button disabled={isTalking}>
        Take Snapshot
      </button>
    </div>
  );
}
```

---

## API Integration

### Starting a Talk Session

```typescript
// 1. Request talk session
const response = await fetch("/api/talk", {
  method: "POST",
  headers: { "content-type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ cameraId: "cam-001" }),
});

const session = await response.json();
// {
//   sessionId: "uuid",
//   cameraId: "cam-001", 
//   audio: {
//     url: "https://media.example/v1/talk/uuid/audio",
//     bearerToken: "token",
//     contentType: "audio/L16;rate=8000;channels=1",
//     codec: "PCMA",
//     sampleRate: 8000
//   }
// }
```

### Sending Audio

```typescript
// 2. Capture microphone
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  }
});

// 3. Setup Web Audio for resampling
const audioContext = new AudioContext({ latencyHint: "interactive" });
const source = audioContext.createMediaStreamSource(stream);
const processor = audioContext.createScriptProcessor(1024, 1, 1);

processor.onaudioprocess = async (event) => {
  const inputData = event.inputBuffer.getChannelData(0);
  
  // 4. Downsample to 8kHz PCM16
  const pcm16 = downsampleTo8kHz(inputData, audioContext.sampleRate);
  
  // 5. Send to server
  await fetch(session.audio.url, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${session.audio.bearerToken}`,
      "content-type": session.audio.contentType,
    },
    body: pcm16,
  });
};

source.connect(processor);
processor.connect(audioContext.destination);
```

### Ending Session

```typescript
// 6. Cleanup
await fetch(session.audio.endUrl, {
  method: "DELETE",
  headers: {
    "authorization": `Bearer ${session.audio.bearerToken}`,
  },
});

processor.disconnect();
source.disconnect();
stream.getTracks().forEach(track => track.stop());
```

---

## Using Audio Monitoring

### Fetch Audio Channels

```typescript
const response = await fetch("/v1/audio-monitoring/channels", {
  headers: { "authorization": `Bearer ${sessionToken}` }
});

const { data: channels } = await response.json();
// channels = [
//   {
//     cameraId: "cam-001",
//     cameraName: "Front Gate",
//     isEnabled: true,
//     codec: "PCMA",
//     sampleRateHz: 8000,
//     currentMetrics: {
//       peakDbFS: -12.5,
//       rmsDbFS: -18.3,
//       isVoiceActive: true,
//       ...
//     }
//   }
// ]
```

### Monitor Real-Time Audio

```typescript
// Using Server-Sent Events (SSE)
const eventSource = new EventSource(
  `/v1/audio-monitoring/channels/${cameraId}/stream`,
  { withCredentials: true }
);

eventSource.onmessage = (event) => {
  const metrics = JSON.parse(event.data);
  
  // Update VU meter
  updateVuMeter(metrics.peakDbFS, metrics.rmsDbFS);
  
  // Check for alerts
  if (metrics.alerts?.length > 0) {
    handleAudioAlert(metrics.alerts);
  }
};
```

### Configure Audio Channel

```typescript
await fetch(`/v1/audio-monitoring/channels/${cameraId}/config`, {
  method: "PUT",
  headers: {
    "authorization": `Bearer ${sessionToken}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    isEnabled: true,
    gainDb: 3.0,                    // Boost by 3dB
    silenceThresholdDbFS: -60,      // Detect silence below -60dBFS
    silenceTimeoutSec: 15,          // Alert after 15s of silence
    noiseThresholdDbFS: -12,        // Alert if above -12dBFS
    screamDetectionEnabled: true,   // Enable distress detection
    clippingAlertEnabled: true,     // Alert on audio clipping
  }),
});
```

---

## Edge Agent Integration

### Check Edge Agent Audio Support

```typescript
// Internal API (media gateway only)
const response = await fetch(
  `/internal/edge-agents/${nodeId}/media-url`,
  {
    headers: { "x-media-gateway-key": sharedKey }
  }
);

const { localMediaUrl } = await response.json();
// localMediaUrl = "http://192.168.1.100:8091"

// Test if edge agent supports talkback
const talkSupport = await fetch(`${localMediaUrl}/v1/talk/start`, {
  method: "OPTIONS"
});
const supportsTalk = talkSupport.status === 204;
```

---

## Camera Compatibility

### Check Camera Audio Capabilities

```typescript
const camera = await fetchCamera(cameraId);

// Check for speaker (talkback)
const supportsTalkback = 
  camera.capabilities?.audio === true &&
  camera.capabilities?.talkback === true;

// Check for microphone (monitoring)
const supportsMonitoring = 
  camera.capabilities?.audio === true &&
  camera.onvifCapabilities?.includes("AudioSource");
```

### Supported Vendors & Protocols

**Talkback (Speaker):**
- ONVIF Profile T (backchannel)
- Hikvision ISAPI (`/ISAPI/System/TwoWayAudio/channels/1`)
- Dahua Private3 (`/live/talk.xav?proto=Private3`)
- CP Plus (Dahua variant)

**Monitoring (Microphone):**
- ONVIF Profile S/T/G (audio track)
- All major brands with RTSP audio streams

---

## Error Handling

### Common Error Codes

```typescript
try {
  await startTalkFromBrowser(cameraId);
} catch (error) {
  switch (error.message) {
    case "talkback_busy":
      alert("Another operator is talking to this camera");
      break;
    
    case "talkback_not_supported":
      alert("Camera doesn't support 2-way audio");
      break;
    
    case "microphone_not_available":
      alert("Please allow microphone access");
      break;
    
    case "device_credentials_rejected":
      alert("Camera credentials are incorrect");
      break;
    
    case "edge_audio_forward_failed":
      alert("Connection to camera failed");
      break;
    
    default:
      alert("Talkback unavailable: " + error.message);
  }
}
```

---

## Testing

### Manual Testing

1. **Talkback:**
   ```bash
   # Terminal 1: Start services
   npm run dev
   
   # Terminal 2: Check talk session
   curl -X POST http://localhost:8080/api/talk \
     -H "Content-Type: application/json" \
     -d '{"cameraId": "cam-001"}'
   ```

2. **Audio Monitoring:**
   ```bash
   # Check audio channels
   curl http://localhost:8080/v1/audio-monitoring/channels \
     -H "Authorization: Bearer $TOKEN"
   ```

### Automated Testing

```typescript
// media-gateway/test/app.test.ts
it("forwards audio to edge agent", async () => {
  const pcmChunk = Buffer.from(new Int16Array([100, 200]).buffer);
  
  const audioRes = await app.inject({
    method: "POST",
    url: `/v1/talk/${sessionId}/audio`,
    headers: {
      authorization: `Bearer ${bearerToken}`,
      "content-type": "audio/L16",
    },
    payload: pcmChunk,
  });
  
  expect(audioRes.statusCode).toBe(202);
  expect(edgeAudioReceived).toEqual(pcmChunk);
});
```

---

## Performance Optimization

### Reduce Latency

```typescript
// Use smallest buffer size
const processor = audioContext.createScriptProcessor(256, 1, 1);

// Prefer WebRTC when available
const useWebRTC = 'RTCPeerConnection' in window;

// Batch audio chunks for efficiency
let audioBuffer: Int16Array[] = [];

processor.onaudioprocess = (event) => {
  audioBuffer.push(downsample(event.inputBuffer.getChannelData(0)));
  
  // Send every 100ms
  if (audioBuffer.length >= 5) {
    sendAudioBatch(audioBuffer);
    audioBuffer = [];
  }
};
```

### Monitor Performance

```typescript
const metrics = {
  audioLatency: 0,
  packetsDropped: 0,
  bufferUnderrun: 0,
};

// Track latency
const sendTime = Date.now();
await sendAudio(chunk);
metrics.audioLatency = Date.now() - sendTime;

// Alert if degraded
if (metrics.audioLatency > 500) {
  console.warn("High audio latency:", metrics.audioLatency);
}
```

---

## Security Considerations

1. **Always verify permissions:**
   ```typescript
   const access = await checkCameraAccess(cameraId, "audio:talk");
   if (!access.allowed) {
     throw new Error("No permission to use talkback");
   }
   ```

2. **Audit all talk sessions:**
   ```typescript
   await logAudit({
     action: "talk_session.started",
     userId,
     cameraId,
     duration: sessionDurationMs,
   });
   ```

3. **Rate limit talk requests:**
   ```typescript
   // Prevent spam
   const recentSessions = await getUserTalkSessions(userId, "1h");
   if (recentSessions.length > 10) {
     throw new Error("Too many talk sessions");
   }
   ```

---

## Debugging

### Enable Verbose Logging

```typescript
// In browser console
localStorage.setItem("debug", "audio:*");

// In edge agent
EDGE_LOG_LEVEL=debug npm run dev

// In media gateway
LOG_LEVEL=debug npm start
```

### Inspect Audio Packets

```typescript
processor.onaudioprocess = (event) => {
  const samples = event.inputBuffer.getChannelData(0);
  
  // Check for silence
  const maxAmplitude = Math.max(...samples.map(Math.abs));
  if (maxAmplitude < 0.01) {
    console.warn("Audio signal too weak:", maxAmplitude);
  }
  
  // Check for clipping
  if (maxAmplitude > 0.95) {
    console.warn("Audio clipping detected:", maxAmplitude);
  }
};
```

---

## Quick Commands

```bash
# Test talkback capability
curl http://localhost:8080/v1/cameras/${CAMERA_ID}/talkback/capability

# List audio channels
curl http://localhost:8080/v1/audio-monitoring/channels

# Check edge agent media URL
curl http://localhost:8080/internal/edge-agents/${NODE_ID}/media-url \
  -H "x-media-gateway-key: ${SHARED_KEY}"
```

---

## Support

For issues or questions:
- Check logs: `media-gateway.log`, `edge-agent.log`, `control-plane.log`
- Review docs: `docs/media/TWO_WAY_AUDIO_TALKBACK.md`
- Run tests: `npm test` in `media-gateway/`
- Status: See `TWO_WAY_AUDIO_STATUS.md`
