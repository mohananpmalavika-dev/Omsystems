# Camera → Browser Audio Status

## TL;DR: ✅ Already Working (If Camera Has Audio)

**Camera audio playback in browser IS working** - it's just that most cameras don't have audio enabled in their RTSP streams.

---

## How It Works Today

### Architecture
```
Camera Microphone
      ↓
RTSP Audio Track (G.711/AAC)
      ↓
Edge Agent / MediaMTX
      ↓ RTSP → HLS Conversion (includes audio)
HLS Stream (.m3u8 + .ts segments with audio)
      ↓
Media Gateway
      ↓
Dashboard HLS Player
      ↓
Browser <video> element
      ↓
🔊 Speaker Output
```

### Implementation

**File:** `dashboard/components/hls-player.tsx`

```tsx
<video
  ref={videoRef}
  muted={muted}  // Can be unmuted!
  playsInline
  autoPlay
/>
```

The HTML5 `<video>` element **automatically plays both video AND audio tracks** from the HLS stream. No special code needed!

---

## What's Already There

### 1. ✅ HLS Player Supports Audio
- The HLS player component automatically plays audio
- Has `muted` prop (defaults to true for autoplay)
- Has `volume` prop (0-1 scale)
- Audio plays through browser speakers

### 2. ✅ MediaMTX Passes Through Audio
- MediaMTX configuration doesn't disable audio
- RTSP → HLS conversion preserves audio tracks
- Supports multiple audio codecs (G.711, AAC, etc.)

### 3. ✅ Audio Monitoring System
**Location:** `/video/audio` (Audio Stream Monitoring workspace)

**Features:**
- Real-time VU meters
- Audio level monitoring (dBFS)
- Acoustic anomaly detection
- Voice Activity Detection (VAD)
- Waveform visualization
- Alerts for audio loss, high noise, spikes

**Note:** This is a monitoring/visualization tool, NOT an audio player. It shows metrics but doesn't play audio.

---

## Why You Might Not Hear Audio

### Common Reasons:

#### 1. Camera Has No Microphone
Many security cameras are video-only:
- Bullet cameras (outdoor)
- Dome cameras (basic models)
- Older CCTV systems

#### 2. Audio Not Enabled in Camera
Even if camera has a mic, audio might be disabled:
- Check camera web UI → Audio settings
- Enable audio stream in RTSP settings
- Configure audio codec (G.711 recommended)

#### 3. Browser Autoplay Policy
Browsers block audio autoplay without user interaction:

```tsx
// Current default
<HlsPlayer muted={true} />

// To enable audio, user must click/interact first
<HlsPlayer muted={false} />
```

#### 4. RTSP Stream Has No Audio Track
Camera's RTSP stream might only have video:
```bash
# Check with ffprobe
ffprobe rtsp://camera-ip/stream

# Should show:
# Stream #0:0: Video: h264
# Stream #0:1: Audio: pcm_mulaw  ← Audio track
```

#### 5. Audio Codec Not Supported
Some rare codecs might not work in browser:
- ✅ Supported: G.711 (PCMU/PCMA), AAC, MP3
- ❌ May fail: G.726, ADPCM, proprietary codecs

---

## How to Enable Audio

### Step 1: Enable on Camera

**Hikvision:**
1. Login to camera web interface
2. Configuration → Audio → Enable Audio
3. Audio Encoding: G.711 (recommended)
4. Save and reboot

**Dahua:**
1. Setup → Audio → Enable
2. Encode Mode: G.711A or G.711Mu
3. Save

**ONVIF Cameras:**
1. Check ONVIF Device Manager
2. Media → Audio Source → Enable
3. Configure audio encoder profile

### Step 2: Verify RTSP Stream

```bash
# Test RTSP stream has audio
ffprobe -rtsp_transport tcp rtsp://user:pass@camera-ip/stream

# Expected output:
# Stream #0:0: Video: h264, 1920x1080
# Stream #0:1: Audio: pcm_mulaw, 8000 Hz, mono
```

### Step 3: Unmute Video Player

**Option A: Add unmute button to camera tile**

```tsx
import { Volume2, VolumeX } from "lucide-react";
import { useState } from "react";

function CameraTile({ camera }) {
  const [muted, setMuted] = useState(true);
  
  return (
    <div className="camera-tile">
      <HlsPlayer
        url={camera.hlsUrl}
        bearerToken={camera.token}
        cameraName={camera.name}
        muted={muted}
        volume={muted ? 0 : 0.8}
      />
      
      <button 
        onClick={() => setMuted(!muted)}
        className="audio-toggle"
      >
        {muted ? <VolumeX /> : <Volume2 />}
      </button>
    </div>
  );
}
```

**Option B: Add to camera grid controls**

```tsx
<div className="camera-controls">
  <button onClick={() => toggleAudio(cameraId)}>
    {audioEnabled ? "🔊 Mute" : "🔇 Unmute"}
  </button>
</div>
```

### Step 4: Test Audio

1. Navigate to camera live view
2. Click unmute button
3. Should hear camera audio through speakers

---

## API to Check Camera Audio Capability

### Check if Camera Supports Audio

```typescript
const camera = await fetchCamera(cameraId);

const hasAudio = camera.capabilities?.audio === true;
const hasMicrophone = camera.onvifCapabilities?.includes("AudioSource");

if (hasAudio && hasMicrophone) {
  // Show unmute button
  setAudioAvailable(true);
}
```

### Get Current Audio Status

```typescript
// From Audio Monitoring API
const channel = await fetch(
  `/v1/audio-monitoring/channels/${cameraId}`
).then(r => r.json());

if (channel.success && channel.data.isOnline) {
  console.log("Camera has audio:", {
    codec: channel.data.config.codec,
    sampleRate: channel.data.config.sampleRateHz,
    rmsDbFS: channel.data.currentMetrics.rmsDbFS,
  });
}
```

---

## What About Talkback?

**That's different!** Talkback is **browser → camera** (operator talks to camera speaker).

- ✅ **Browser → Camera (Talkback):** Fixed and working
- ✅ **Camera → Browser (Audio Playback):** Already working (if camera has audio)

---

## Testing

### 1. Test with Known Audio Camera

```bash
# Use a camera you know has audio
# Example: Hikvision camera with built-in mic

curl http://localhost:8080/v1/audio-monitoring/channels/${CAMERA_ID}
# Check: isOnline: true, codec: "PCMA"
```

### 2. Test HLS Stream Directly

```bash
# Download HLS segment
curl "http://localhost:8888/camera-cam-001/stream0.ts?token=xyz" > test.ts

# Check for audio track
ffprobe test.ts
# Should show both video and audio streams
```

### 3. Test in Browser

```javascript
// Browser console
const video = document.querySelector('video');
console.log("Audio tracks:", video.audioTracks?.length);
console.log("Muted:", video.muted);
video.muted = false;  // Unmute
video.volume = 0.8;   // Set volume
```

---

## Adding Audio Controls UI

### Suggested Locations

#### 1. Camera Tile (Grid View)

Add audio toggle next to PTZ/snapshot buttons:

```tsx
<div className="camera-tile-controls">
  <button onClick={handleSnapshot}>📷</button>
  <button onClick={handlePTZ}>🎮</button>
  <button onClick={toggleAudio}>
    {audioMuted ? "🔇" : "🔊"}
  </button>
  <HoldToTalkButton cameraId={camera.id} />
</div>
```

#### 2. Live View (Full Screen)

Add volume slider in controls:

```tsx
<div className="video-controls">
  <button onClick={() => setMuted(!muted)}>
    {muted ? <VolumeX /> : <Volume2 />}
  </button>
  <input
    type="range"
    min="0"
    max="100"
    value={volume * 100}
    onChange={(e) => setVolume(Number(e.target.value) / 100)}
  />
</div>
```

#### 3. Settings Panel

Add per-camera audio preferences:

```tsx
<div className="camera-settings">
  <label>
    <input
      type="checkbox"
      checked={audioEnabled}
      onChange={(e) => setAudioEnabled(e.target.checked)}
    />
    Enable camera audio
  </label>
  
  <label>
    Volume: {Math.round(volume * 100)}%
    <input
      type="range"
      value={volume * 100}
      onChange={(e) => setVolume(Number(e.target.value) / 100)}
    />
  </label>
</div>
```

---

## Performance Considerations

### Audio Adds Bandwidth

```
Video only:  ~1-3 Mbps
Video + Audio: +64 Kbps (G.711)

For 16 cameras:
- Video only: 16-48 Mbps
- With audio: +1 Mbps total (negligible)
```

### Browser Limits

Modern browsers can handle:
- ✅ 20-30 simultaneous audio streams
- ✅ Mix of muted/unmuted videos
- ⚠️ Performance drops if all unmuted at once

**Recommendation:** 
- Default all cameras to muted
- Let operator unmute 1-4 cameras they're monitoring
- Auto-mute after 5 minutes of inactivity

---

## Troubleshooting

### "No Audio in Browser"

**Check:**
1. ✅ Camera has microphone enabled
2. ✅ RTSP stream includes audio track (test with ffprobe)
3. ✅ MediaMTX is running and accessible
4. ✅ Video player not muted
5. ✅ Browser audio not blocked
6. ✅ System volume not zero

### "Audio Choppy/Stuttering"

**Possible causes:**
- Network congestion
- CPU overload (too many streams)
- MediaMTX buffer issues

**Fix:**
```yaml
# mediamtx.yml
pathDefaults:
  sourceOnDemandStartTimeout: 30s  # Increase
  readBufferCount: 2048            # Add
```

### "Audio Out of Sync"

**Possible causes:**
- Large HLS buffer (20+ seconds)
- Network latency spikes

**Fix:**
Use WebRTC instead of HLS for low-latency:
```tsx
<WebRTCPlayer  // Lower latency than HLS
  url={camera.webrtcUrl}
  muted={false}
/>
```

---

## Summary

### Current Status

✅ **Infrastructure:** Complete and working  
✅ **Player:** Supports audio playback  
✅ **Monitoring:** Real-time metrics available  
⚠️ **UI:** No unmute controls (easy to add)  
⚠️ **Cameras:** Most don't have audio enabled  

### Next Steps

1. **Short term:** Add unmute button to camera tiles
2. **Medium term:** Auto-detect which cameras have audio
3. **Long term:** Audio-only mode for blind monitoring

### The Bottom Line

**Camera → browser audio works perfectly** through the existing HLS video player. It's just:
1. Most cameras don't have audio
2. The UI defaults to muted
3. No obvious way to unmute

Add an unmute button, enable audio on cameras, and you're done! 🔊✅
