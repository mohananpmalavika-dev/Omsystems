#!/bin/bash
# Audio Transcoding Script for MediaMTX
# Converts camera audio (G.711/PCMU/PCMA) to AAC for browser HLS playback
#
# Environment variables provided by MediaMTX:
# - MTX_PATH: The stream path
# - RTSP_PORT: The RTSP server port (default 8554)

INPUT_PATH="$MTX_PATH"
OUTPUT_PATH="${MTX_PATH}"

# FFmpeg command to transcode audio to AAC while copying video
exec ffmpeg \
  -fflags nobuffer \
  -flags low_delay \
  -rtsp_transport tcp \
  -i "rtsp://127.0.0.1:${RTSP_PORT:-8554}/${INPUT_PATH}" \
  -c:v copy \
  -c:a aac \
  -b:a 128k \
  -ar 48000 \
  -ac 2 \
  -f rtsp \
  -rtsp_transport tcp \
  "rtsp://127.0.0.1:${RTSP_PORT:-8554}/${OUTPUT_PATH}_aac"
