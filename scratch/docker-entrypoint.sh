#!/usr/bin/env bash
set -e

ARCFACE_MODEL_PATH="${ARCFACE_MODEL_PATH:-/app/analytics-engine/models/face/arcface_r100.onnx}"
ARCFACE_GCS_URI="${ARCFACE_GCS_URI:-gs://kryptovision-installer-7866fc3f/models/arcface_r100.onnx}"

echo "======================================================"
echo "🚀 Sentinel Grid — Container Startup"
echo "======================================================"

MODEL_DIR="$(dirname "$ARCFACE_MODEL_PATH")"
mkdir -p "$MODEL_DIR"

if [ ! -f "$ARCFACE_MODEL_PATH" ]; then
  echo "📥 Checking ArcFace model..."
  if command -v gsutil >/dev/null 2>&1 && gsutil -q cp "$ARCFACE_GCS_URI" "$ARCFACE_MODEL_PATH" 2>/dev/null; then
    echo "✅ ArcFace model downloaded via gsutil."
  else
    echo "⚠️  gsutil download skipped. Using local placeholder."
    touch "$ARCFACE_MODEL_PATH"
  fi
else
  echo "✅ ArcFace model already present. Skipping download."
fi

echo "🗄️  Running database migrations..."
node scripts/run-migrations.mjs || true

echo "🎯 Starting Sentinel Grid Control Plane..."
exec node dist/src/index.js
