# Audio Not Working in Live Camera View - Fix Guide

## Problem
Camera has audio hardware and audio works in other software (like VLC), but there's **no audio in the browser** when viewing live cameras, even after unmuting.

## Root Cause
**MediaMTX does not transcode audio by default.** Most IP cameras send audio in **G.711 format (PCMU/PCMA)** which browsers **cannot play** in HLS streams. Browsers require **AAC audio codec** for HLS playback.

## Solution Options

### Option 1: FFmpeg Audio Transcoding Proxy (Recommended)

Create an FFmpeg process that transcodes camera audio to AAC before it reaches MediaMTX.

**Step 1:** Create a transcoding script `media-gateway/rtsp-audio-proxy.sh`:

```bash
#!/bin/bash
# RTSP Audio Transcoding Proxy
# Converts camera G.711 audio to AAC for browser compatibility

CAMERA_RTSP_URL="$1"  # Input: Original camera RTSP URL
OUTPUT_PORT="${2:-8554}"  # Output: RTSP port for MediaMTX
STREAM_PATH="$3"  # Stream path name

ffmpeg \
  -rtsp_transport tcp \
  -i "$CAMERA_RTSP_URL" \
  -c:v copy \
  -c:a aac -b:a 128k -ar 48000 -ac 2 \
  -f rtsp \
  -rtsp_transport tcp \
  "rtsp://127.0.0.1:${OUTPUT_PORT}/${STREAM_PATH}"
```

**Step 2:** Make it executable:
```bash
chmod +x media-gateway/rtsp-audio-proxy.sh
```

**Step 3:** Run the proxy for each camera:
```bash
./rtsp-audio-proxy.sh "rtsp://camera-ip:554/stream1" 8554 "camera001"
```

**Step 4:** Configure MediaMTX to accept the transcoded stream (already configured).

### Option 2: Update Camera Configuration

Some cameras can be configured to send AAC audio instead of G.711.

**Check your camera's web interface:**
1. Log into camera admin panel
2. Go to Audio/Codec settings
3. Change audio codec from **G.711/PCMU/PCMA** to **AAC**
4. Set bitrate to 128 kbps
5. Set sample rate to 48000 Hz
6. Save and reboot camera

### Option 3: Use GStreamer Pipeline (Alternative)

If FFmpeg is not available, use GStreamer:

```bash
gst-launch-1.0 \
  rtspsrc location=rtsp://camera-ip:554/stream1 ! \
  rtph264depay ! h264parse ! rtph264pay name=pay0 pt=96 ! \
  rtspsrc location=rtsp://camera-ip:554/stream1 ! \
  rtppcmudepay ! audioconvert ! audioresample ! \
  voaacenc bitrate=128000 ! rtpmp4apay name=pay1 pt=97 ! \
  rtpbin ! udpsink host=127.0.0.1 port=8554
```

### Option 4: MediaMTX runOnReady Hook (Advanced)

Add to `media-gateway/mediamtx.yml`:

```yaml
paths:
  all:
    runOnReady: >
      ffmpeg -rtsp_transport tcp -i rtsp://127.0.0.1:$RTSP_PORT/$MTX_PATH
      -c:v copy -c:a aac -b:a 128k -ar 48000
      -f rtsp rtsp://127.0.0.1:$RTSP_PORT/${MTX_PATH}_aac
    runOnReadyRestart: yes
```

Then update your application to request `camera001_aac` instead of `camera001`.

## Verification Steps

### 1. Check Camera Audio Codec
```bash
ffprobe -v error -select_streams a:0 \
  -show_entries stream=codec_name \
  -of default=noprint_wrappers=1:nokey=1 \
  rtsp://camera-ip:554/stream1
```

**Expected output if problem exists:**
```
pcm_mulaw  (or pcm_alaw)
```

**Expected output after fix:**
```
aac
```

### 2. Check HLS Playlist Audio
```bash
curl http://media-gateway:8888/camera001/index.m3u8
```

Look for audio track specification. Should see:
```
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Audio",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="2"
```

### 3. Browser Console Check
Open browser developer tools (F12) → Console tab.

**If audio is working:**
```
No audio-related errors
```

**If audio codec is unsupported:**
```
Error: MEDIA_ERR_SRC_NOT_SUPPORTED
or
DOMException: The element has no supported sources
```

### 4. Network Tab Check
Open Developer Tools → Network tab → Filter by `.m3u8` and `.ts`

Download a `.ts` segment file and check with FFprobe:
```bash
ffprobe segment.ts 2>&1 | grep Audio
```

Should show:
```
Stream #0:1: Audio: aac, 48000 Hz, stereo, fltp, 128 kb/s
```

## Testing the Fix

### Test 1: Direct FFmpeg Test
```bash
ffmpeg -i rtsp://camera-ip:554/stream1 \
  -c:v copy -c:a aac -b:a 128k \
  -f hls -hls_time 3 -hls_list_size 3 \
  test_output.m3u8
```

Play `test_output.m3u8` in VLC. If audio works here, the transcode works.

### Test 2: Browser Test
1. Clear browser cache (Ctrl+Shift+Delete)
2. Reload live camera page
3. Unmute camera
4. Right-click video → "Show video statistics" (Chrome) or "Media info" (Firefox)
5. Check if audio codec shows "aac" or "mp4a"

## Common Issues

### Issue 1: Still No Audio After Transcoding
**Cause:** Browser autoplay policy blocking audio

**Fix:** Add to `hls-player.tsx`:
```typescript
video.play().then(() => {
  console.log('Playback started with audio');
}).catch((error) => {
  console.log('Autoplay blocked, user interaction needed:', error);
});
```

### Issue 2: Audio Delays or Out of Sync
**Cause:** Audio/video sync issues in transcoding

**Fix:** Add `-async 1` to FFmpeg command:
```bash
ffmpeg ... -async 1 -c:a aac ...
```

### Issue 3: Audio Stuttering
**Cause:** Insufficient buffer or CPU overload

**Fix 1 - Increase buffer:**
```yaml
hlsSegmentDuration: 4s  # Increase from 3s
```

**Fix 2 - Lower audio quality:**
```bash
-c:a aac -b:a 64k  # Reduce from 128k
```

## Production Deployment Checklist

- [ ] Verify all cameras support audio
- [ ] Test audio transcoding for each camera model
- [ ] Monitor CPU usage (transcoding adds ~5-10% per stream)
- [ ] Set up audio quality monitoring
- [ ] Configure audio alerts (audio loss detection)
- [ ] Document camera-specific audio settings
- [ ] Test across browsers (Chrome, Firefox, Safari, Edge)
- [ ] Test on mobile devices (iOS Safari, Android Chrome)
- [ ] Verify audio works after page reload
- [ ] Test audio with multiple simultaneous streams

## Architecture Summary

```
┌─────────────┐     G.711 Audio      ┌──────────────┐     AAC Audio       ┌─────────────┐
│   Camera    │ ──────────────────> │    FFmpeg    │ ─────────────────> │  MediaMTX   │
│  (RTSP)     │   PCMU/PCMA (8kHz)   │  Transcoder  │  AAC (48kHz, 128k) │   (HLS)     │
└─────────────┘                       └──────────────┘                     └─────────────┘
                                                                                   │
                                                                                   │ HLS
                                                                                   ▼
                                                                           ┌─────────────┐
                                                                           │   Browser   │
                                                                           │  (HTML5)    │
                                                                           └─────────────┘
```

## Quick Fix Command

For immediate testing, run this command on the media gateway server:

```bash
# Replace CAMERA_IP and CAMERA_PORT with your camera details
ffmpeg -rtsp_transport tcp \
  -i rtsp://CAMERA_IP:554/stream1 \
  -c:v copy \
  -c:a aac -b:a 128k -ar 48000 -ac 2 \
  -f rtsp \
  -rtsp_transport tcp \
  rtsp://127.0.0.1:8554/test_camera

# Then in browser, navigate to:
# http://media-gateway:8888/test_camera/index.m3u8
```

If you hear audio, the transcode solution works for your camera.

## Support

If audio still doesn't work after following this guide:

1. Check MediaMTX logs: `docker logs media-gateway` or `journalctl -u mediamtx`
2. Check browser console for errors
3. Verify camera audio with VLC: `vlc rtsp://camera-ip:554/stream1`
4. Test different audio codecs: `-c:a libopus` or `-c:a mp3`

## References

- [MediaMTX Documentation](https://github.com/bluenviron/mediamtx)
- [FFmpeg Audio Transcoding Guide](https://trac.ffmpeg.org/wiki/Encode/AAC)
- [HLS Audio Requirements](https://developer.apple.com/documentation/http_live_streaming)
- [Browser Audio Codec Support](https://caniuse.com/aac)
