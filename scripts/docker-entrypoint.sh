#!/usr/bin/env bash
# =============================================================
# Sentinel Grid — Docker Entrypoint
# Downloads AI models from GCS on first start, then launches app
# =============================================================
set -e

ARCFACE_MODEL_PATH="${ARCFACE_MODEL_PATH:-/app/analytics-engine/models/face/arcface_r100.onnx}"
ARCFACE_GCS_URI="${ARCFACE_GCS_URI:-gs://kryptovision-installer-7866fc3f/models/arcface_r100.onnx}"
ARCFACE_MODEL_SHA256="${ARCFACE_MODEL_SHA256:-}"

echo "======================================================"
echo "🚀 Sentinel Grid — Container Startup"
echo "======================================================"

# ── Download ArcFace model from GCS if missing ──────────────
MODEL_DIR="$(dirname "$ARCFACE_MODEL_PATH")"
mkdir -p "$MODEL_DIR"

if [ ! -f "$ARCFACE_MODEL_PATH" ]; then
  echo "📥 ArcFace model not found locally. Downloading from GCS..."
  echo "   Source : $ARCFACE_GCS_URI"
  echo "   Dest   : $ARCFACE_MODEL_PATH"

  # Try gsutil first (available inside GCP VMs via Workload Identity)
  if command -v gsutil >/dev/null 2>&1; then
    gsutil -q cp "$ARCFACE_GCS_URI" "$ARCFACE_MODEL_PATH"
    echo "✅ ArcFace model downloaded via gsutil."
  else
    echo "⚠️  gsutil not found — trying wget as fallback..."
    FALLBACK_URL="${ARCFACE_MODEL_FALLBACK_URL:-https://huggingface.co/onnxmodelzoo/arcfaceresnet100-8/resolve/main/arcfaceresnet100-8.onnx}"
    wget -q --show-progress -O "$ARCFACE_MODEL_PATH" "$FALLBACK_URL"
    echo "✅ ArcFace model downloaded via wget (fallback)."
  fi

  # Optional SHA-256 verification
  if [ -n "$ARCFACE_MODEL_SHA256" ] && command -v sha256sum >/dev/null 2>&1; then
    echo "🔍 Verifying SHA-256..."
    ACTUAL_SHA=$(sha256sum "$ARCFACE_MODEL_PATH" | cut -d' ' -f1)
    if [ "$ACTUAL_SHA" != "$ARCFACE_MODEL_SHA256" ]; then
      echo "❌ SHA-256 mismatch! Expected: $ARCFACE_MODEL_SHA256, got: $ACTUAL_SHA"
      rm -f "$ARCFACE_MODEL_PATH"
      exit 1
    fi
    echo "✅ SHA-256 verified."
  fi
else
  SIZE_MB=$(du -m "$ARCFACE_MODEL_PATH" | cut -f1)
  echo "✅ ArcFace model already present (${SIZE_MB} MB). Skipping download."
fi

# ── Run database migrations ──────────────────────────────────
echo "🗄️  Running database migrations..."
node scripts/run-migrations.mjs

# ── Start application ────────────────────────────────────────
echo "🎯 Starting Sentinel Grid Control Plane..."
exec node dist/src/index.js
