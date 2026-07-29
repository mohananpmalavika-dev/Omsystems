#!/bin/bash

###############################################################################
# Zero-Cost AI Models Download Script
# Downloads all open-source models required for enterprise video analytics
###############################################################################

set -e  # Exit on error

echo "=========================================="
echo " Sentinel Analytics Engine - Model Setup"
echo "=========================================="
echo ""

# Configuration
if [ -n "${MODELS_DIR:-}" ]; then
    MODELS_DIR="$MODELS_DIR"
elif [ -d "/app" ]; then
    MODELS_DIR="/app/models"
else
    # Local `npm run models:download` is run from analytics-engine.
    MODELS_DIR="$(pwd)/models"
fi
TEMP_DIR="/tmp/sentinel-models"
PYTHON_ENV="sentinel-ml"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check Python
if ! command -v python3 &> /dev/null; then
    log_error "Python 3 is required but not installed"
    exit 1
fi

# Create directories
log_info "Creating model directories..."
mkdir -p "$MODELS_DIR/detection"
mkdir -p "$MODELS_DIR/tracking"
mkdir -p "$MODELS_DIR/face"
mkdir -p "$MODELS_DIR/vehicle"
mkdir -p "$MODELS_DIR/safety"
mkdir -p "$MODELS_DIR/nlp"
mkdir -p "$TEMP_DIR"

# Create virtual environment
log_info "Setting up Python environment..."
if [ ! -d "$TEMP_DIR/venv" ]; then
    python3 -m venv "$TEMP_DIR/venv"
fi
source "$TEMP_DIR/venv/bin/activate"

# Install required packages
log_info "Installing Python dependencies..."
pip install --quiet --upgrade pip
pip install --quiet ultralytics torch torchvision onnx onnxruntime insightface transformers huggingface_hub

echo ""
log_info "=== 1. Downloading YOLOv8 Models (Object Detection) ==="

# YOLOv8 Nano (Fastest)
if [ ! -f "$MODELS_DIR/detection/yolov8n.onnx" ]; then
    log_info "Downloading YOLOv8n..."
    yolo export model=yolov8n.pt format=onnx imgsz=640 simplify=True
    mv yolov8n.onnx "$MODELS_DIR/detection/"
    log_info "✓ YOLOv8n downloaded (6.3 MB)"
else
    log_info "✓ YOLOv8n already exists"
fi

# YOLOv8 Small
if [ ! -f "$MODELS_DIR/detection/yolov8s.onnx" ]; then
    log_info "Downloading YOLOv8s..."
    yolo export model=yolov8s.pt format=onnx imgsz=640 simplify=True
    mv yolov8s.onnx "$MODELS_DIR/detection/"
    log_info "✓ YOLOv8s downloaded (22 MB)"
else
    log_info "✓ YOLOv8s already exists"
fi

# YOLOv8 Medium (Recommended)
if [ ! -f "$MODELS_DIR/detection/yolov8m.onnx" ]; then
    log_info "Downloading YOLOv8m..."
    yolo export model=yolov8m.pt format=onnx imgsz=640 simplify=True
    mv yolov8m.onnx "$MODELS_DIR/detection/"
    log_info "✓ YOLOv8m downloaded (52 MB)"
else
    log_info "✓ YOLOv8m already exists"
fi

# YOLOv8-Pose (Human Pose Estimation)
if [ ! -f "$MODELS_DIR/detection/yolov8n-pose.onnx" ]; then
    log_info "Downloading YOLOv8n-Pose..."
    yolo export model=yolov8n-pose.pt format=onnx imgsz=640 simplify=True
    mv yolov8n-pose.onnx "$MODELS_DIR/detection/"
    log_info "✓ YOLOv8n-Pose downloaded (6.5 MB)"
else
    log_info "✓ YOLOv8n-Pose already exists"
fi

# YOLOv8-Seg (Instance Segmentation)
if [ ! -f "$MODELS_DIR/detection/yolov8n-seg.onnx" ]; then
    log_info "Downloading YOLOv8n-Seg..."
    yolo export model=yolov8n-seg.pt format=onnx imgsz=640 simplify=True
    mv yolov8n-seg.onnx "$MODELS_DIR/detection/"
    log_info "✓ YOLOv8n-Seg downloaded (7.2 MB)"
else
    log_info "✓ YOLOv8n-Seg already exists"
fi

echo ""
log_info "=== 2. Downloading Face Recognition Models ==="

# InsightFace (ArcFace + RetinaFace)
if [ ! -f "$MODELS_DIR/face/buffalo_l.zip" ]; then
    log_info "Downloading InsightFace models..."
    python3 << EOF
import insightface
from insightface.app import FaceAnalysis

app = FaceAnalysis(name='buffalo_l', root='$MODELS_DIR/face', providers=['CPUExecutionProvider'])
app.prepare(ctx_id=0, det_size=(640, 640))
print("✓ InsightFace models downloaded (350 MB)")
EOF
else
    log_info "✓ InsightFace already exists"
fi

echo ""
log_info "=== 3. Downloading Tracking & Re-ID Models ==="

# OSNet for Person Re-ID
if [ ! -f "$MODELS_DIR/tracking/osnet_x1_0.pth" ]; then
    log_info "Downloading OSNet Re-ID model..."
    python3 << EOF
import torch
import os

# Download from torchvision model zoo
model_url = 'https://github.com/KaiyangZhou/deep-person-reid/releases/download/v1.0.0/osnet_x1_0_imagenet.pth'
torch.hub.download_url_to_file(model_url, '$MODELS_DIR/tracking/osnet_x1_0.pth')
print("✓ OSNet Re-ID downloaded (9.1 MB)")
EOF
else
    log_info "✓ OSNet already exists"
fi

echo ""
log_info "=== 4. Downloading NLP Models (AI Search & Assistant) ==="

# CLIP for visual search
if [ ! -d "$MODELS_DIR/nlp/clip-vit-base-patch32" ]; then
    log_info "Downloading CLIP model..."
    python3 << EOF
from transformers import CLIPModel, CLIPProcessor

model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

model.save_pretrained("$MODELS_DIR/nlp/clip-vit-base-patch32")
processor.save_pretrained("$MODELS_DIR/nlp/clip-vit-base-patch32")
print("✓ CLIP model downloaded (605 MB)")
EOF
else
    log_info "✓ CLIP already exists"
fi

# DistilBERT for NLU
if [ ! -d "$MODELS_DIR/nlp/distilbert-base-uncased" ]; then
    log_info "Downloading DistilBERT..."
    python3 << EOF
from transformers import DistilBertModel, DistilBertTokenizer

model = DistilBertModel.from_pretrained("distilbert-base-uncased")
tokenizer = DistilBertTokenizer.from_pretrained("distilbert-base-uncased")

model.save_pretrained("$MODELS_DIR/nlp/distilbert-base-uncased")
tokenizer.save_pretrained("$MODELS_DIR/nlp/distilbert-base-uncased")
print("✓ DistilBERT downloaded (268 MB)")
EOF
else
    log_info "✓ DistilBERT already exists"
fi

echo ""
log_info "=== 5. Creating Model Configuration ==="

cat > "$MODELS_DIR/config.json" << EOF
{
  "version": "1.0.0",
  "downloaded": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "models": {
    "detection": {
      "yolov8n": {
        "path": "detection/yolov8n.onnx",
        "size": "6.3 MB",
        "speed": "fast",
        "accuracy": "good",
        "recommended_for": ["edge_devices", "high_camera_count"]
      },
      "yolov8s": {
        "path": "detection/yolov8s.onnx",
        "size": "22 MB",
        "speed": "medium",
        "accuracy": "better"
      },
      "yolov8m": {
        "path": "detection/yolov8m.onnx",
        "size": "52 MB",
        "speed": "medium",
        "accuracy": "best",
        "recommended_for": ["production", "balanced_performance"]
      },
      "yolov8n-pose": {
        "path": "detection/yolov8n-pose.onnx",
        "capabilities": ["fall_detection", "activity_recognition", "pose_analysis"]
      },
      "yolov8n-seg": {
        "path": "detection/yolov8n-seg.onnx",
        "capabilities": ["crowd_density", "precise_counting"]
      }
    },
    "face": {
      "insightface": {
        "path": "face/buffalo_l",
        "capabilities": ["face_detection", "face_recognition", "age_gender", "attributes"]
      }
    },
    "tracking": {
      "osnet": {
        "path": "tracking/osnet_x1_0.pth",
        "capabilities": ["person_reid", "cross_camera_tracking"]
      }
    },
    "nlp": {
      "clip": {
        "path": "nlp/clip-vit-base-patch32",
        "capabilities": ["visual_search", "natural_language_query"]
      },
      "distilbert": {
        "path": "nlp/distilbert-base-uncased",
        "capabilities": ["intent_parsing", "query_understanding"]
      }
    }
  }
}
EOF

log_info "✓ Configuration file created"

echo ""
log_info "=== 6. Model Summary ==="

# Calculate total size
TOTAL_SIZE=$(du -sh "$MODELS_DIR" | cut -f1)

echo ""
echo "┌─────────────────────────────────────────────────┐"
echo "│          Model Download Complete!               │"
echo "├─────────────────────────────────────────────────┤"
echo "│ Total Size: $TOTAL_SIZE                         "
echo "│ Location:   $MODELS_DIR                         "
echo "│                                                  │"
echo "│ Downloaded Models:                               │"
echo "│  ✓ YOLOv8 (Nano, Small, Medium)                │"
echo "│  ✓ YOLOv8-Pose (Fall, Activity)                │"
echo "│  ✓ YOLOv8-Seg (Crowd Density)                  │"
echo "│  ✓ InsightFace (Face Recognition)              │"
echo "│  ✓ OSNet (Person Re-ID)                        │"
echo "│  ✓ CLIP (Visual Search)                        │"
echo "│  ✓ DistilBERT (NLU)                           │"
echo "│                                                  │"
echo "│ Next Steps:                                      │"
echo "│  1. Start analytics engine                       │"
echo "│  2. Models will load automatically               │"
echo "│  3. Check health: GET /health                    │"
echo "└─────────────────────────────────────────────────┘"
echo ""

# Cleanup
log_info "Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

log_info "Done! Models are ready for use."
exit 0
