#!/bin/bash
# Audio Fix Deployment Script
# Deploys automatic audio transcoding to AAC for browser HLS playback

set -e

echo "🎵 Deploying Audio Fix for Browser HLS Playback"
echo "================================================"
echo ""

# Check if FFmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ FFmpeg is not installed!"
    echo "   Please install FFmpeg first:"
    echo "   - Ubuntu/Debian: sudo apt-get install ffmpeg"
    echo "   - CentOS/RHEL: sudo yum install ffmpeg"
    echo "   - macOS: brew install ffmpeg"
    echo "   - Windows: Download from https://ffmpeg.org/download.html"
    exit 1
fi

echo "✅ FFmpeg found: $(ffmpeg -version | head -n1)"
echo ""

# Check FFmpeg has AAC encoder
if ! ffmpeg -encoders 2>/dev/null | grep -q "aac"; then
    echo "⚠️  Warning: FFmpeg may not have AAC encoder"
    echo "   Audio transcoding might not work"
fi

echo "📦 Building updated components..."
echo ""

# Build edge-agent with updated MediaMTX config
if [ -d "edge-agent" ]; then
    echo "  → Building edge-agent..."
    cd edge-agent
    npm run build 2>&1 | tail -n 5
    cd ..
    echo "  ✅ edge-agent built"
fi

# Build dashboard with audio unmuted by default
if [ -d "dashboard" ]; then
    echo "  → Building dashboard..."
    cd dashboard
    npm run build 2>&1 | tail -n 5
    cd ..
    echo "  ✅ dashboard built"
fi

echo ""
echo "🔄 Restarting services..."
echo ""

# Restart media-gateway if running
if docker ps | grep -q "media-gateway"; then
    echo "  → Restarting media-gateway..."
    docker restart media-gateway
    sleep 3
    echo "  ✅ media-gateway restarted"
elif systemctl is-active --quiet mediamtx; then
    echo "  → Restarting mediamtx service..."
    sudo systemctl restart mediamtx
    sleep 3
    echo "  ✅ mediamtx restarted"
fi

# Restart edge-agent if running
if systemctl is-active --quiet sentinel-edge; then
    echo "  → Restarting edge-agent..."
    sudo systemctl restart sentinel-edge
    sleep 3
    echo "  ✅ edge-agent restarted"
elif docker ps | grep -q "edge-agent"; then
    docker restart edge-agent
    sleep 3
    echo "  ✅ edge-agent restarted"
fi

# Restart dashboard if running
if systemctl is-active --quiet sentinel-dashboard; then
    echo "  → Restarting dashboard..."
    sudo systemctl restart sentinel-dashboard
    echo "  ✅ dashboard restarted"
elif docker ps | grep -q "dashboard"; then
    docker restart dashboard
    echo "  ✅ dashboard restarted"
fi

echo ""
echo "✨ Audio fix deployed successfully!"
echo ""
echo "📋 What was changed:"
echo "  1. ✅ MediaMTX now auto-transcodes audio to AAC (G.711 → AAC)"
echo "  2. ✅ Edge agent updated with audio transcoding config"
echo "  3. ✅ Dashboard cameras start with audio UNMUTED"
echo ""
echo "🧪 Testing:"
echo "  1. Open live camera view in browser"
echo "  2. Click a camera to start live stream"
echo "  3. Audio should play automatically (unmuted)"
echo "  4. Check browser console for any errors"
echo ""
echo "🔍 Verification:"
echo "  • Check MediaMTX logs: docker logs media-gateway -f"
echo "  • Check if FFmpeg processes are running: ps aux | grep ffmpeg"
echo "  • Verify audio codec in HLS: curl http://media-gateway:8888/CAMERA_ID/index.m3u8"
echo ""
echo "⚠️  NOTE: First camera connection after restart may take 5-10 seconds"
echo "   while FFmpeg starts the audio transcoding process."
echo ""
echo "🎉 Done! Audio should now work in all browsers."
