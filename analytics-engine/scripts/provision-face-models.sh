#!/usr/bin/env bash
#
# Face Recognition Model Provisioning Script
# Downloads, verifies, and configures production-grade face recognition models
#
# Usage:
#   ./scripts/provision-face-models.sh [--all|--essential|--model-id <id>]
#
# Options:
#   --all         Download all face recognition models (including optional)
#   --essential   Download only required models (default)
#   --model-id    Download specific model by ID
#   --verify-only Verify existing models without downloading
#   --skip-verify Skip SHA-256 verification (not recommended)
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MODELS_DIR="${PROJECT_ROOT}/models"
MANIFEST_FILE="${PROJECT_ROOT}/models/manifest.json"
DOWNLOAD_TIMEOUT=300

# Parse command line arguments
MODE="essential"
VERIFY_ONLY=false
SKIP_VERIFY=false
SPECIFIC_MODEL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --all)
      MODE="all"
      shift
      ;;
    --essential)
      MODE="essential"
      shift
      ;;
    --model-id)
      SPECIFIC_MODEL="$2"
      shift 2
      ;;
    --verify-only)
      VERIFY_ONLY=true
      shift
      ;;
    --skip-verify)
      SKIP_VERIFY=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--all|--essential|--model-id <id>] [--verify-only] [--skip-verify]"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

check_dependencies() {
  local missing_deps=()
  
  for cmd in curl jq sha256sum; do
    if ! command -v "$cmd" &> /dev/null; then
      missing_deps+=("$cmd")
    fi
  done
  
  if [ ${#missing_deps[@]} -ne 0 ]; then
    log_error "Missing required dependencies: ${missing_deps[*]}"
    log_info "Install with: sudo apt-get install curl jq coreutils (Linux) or brew install curl jq coreutils (macOS)"
    exit 1
  fi
}

verify_sha256() {
  local file="$1"
  local expected_sha256="$2"
  
  if [ "$SKIP_VERIFY" = true ]; then
    log_warning "Skipping SHA-256 verification for $file"
    return 0
  fi
  
  if [ ! -f "$file" ]; then
    log_error "File not found: $file"
    return 1
  fi
  
  local actual_sha256
  if command -v sha256sum &> /dev/null; then
    actual_sha256=$(sha256sum "$file" | awk '{print $1}')
  elif command -v shasum &> /dev/null; then
    actual_sha256=$(shasum -a 256 "$file" | awk '{print $1}')
  else
    log_error "No SHA-256 utility found"
    return 1
  fi
  
  if [ "$actual_sha256" != "$expected_sha256" ]; then
    log_error "SHA-256 mismatch for $file"
    log_error "Expected: $expected_sha256"
    log_error "Got:      $actual_sha256"
    return 1
  fi
  
  return 0
}

download_model() {
  local model_id="$1"
  local model_name="$2"
  local model_path="$3"
  local source_url="$4"
  local sha256="$5"
  
  local full_path="${MODELS_DIR}/${model_path}"
  local model_dir=$(dirname "$full_path")
  
  # Create directory if it doesn't exist
  mkdir -p "$model_dir"
  
  # Check if file already exists
  if [ -f "$full_path" ]; then
    log_info "Model already exists: $model_name"
    
    if verify_sha256 "$full_path" "$sha256"; then
      log_success "✓ $model_name verified"
      return 0
    else
      log_warning "Existing model failed verification, re-downloading..."
      rm -f "$full_path"
    fi
  fi
  
  # Download model
  log_info "Downloading $model_name..."
  log_info "URL: $source_url"
  
  if curl -L --progress-bar --max-time "$DOWNLOAD_TIMEOUT" -o "$full_path" "$source_url"; then
    log_success "Downloaded $model_name"
  else
    log_error "Failed to download $model_name"
    rm -f "$full_path"
    return 1
  fi
  
  # Verify download
  if verify_sha256 "$full_path" "$sha256"; then
    log_success "✓ $model_name verified and ready"
    return 0
  else
    log_error "Downloaded model failed verification"
    rm -f "$full_path"
    return 1
  fi
}

process_face_models() {
  local mode="$1"
  
  # Define face recognition models
  declare -A FACE_MODELS
  
  # Essential models (required for basic face recognition)
  FACE_MODELS["face-detector"]="required"
  FACE_MODELS["arcface-r100"]="required"
  
  # Optional but recommended
  FACE_MODELS["face-embedding"]="optional"      # Fast fallback model
  FACE_MODELS["face-quality"]="optional"        # Quality assessment
  FACE_MODELS["face-liveness"]="optional"       # Anti-spoofing
  
  local models_to_download=()
  
  if [ -n "$SPECIFIC_MODEL" ]; then
    models_to_download=("$SPECIFIC_MODEL")
  elif [ "$mode" = "all" ]; then
    models_to_download=("${!FACE_MODELS[@]}")
  else
    # Essential only
    for model in "${!FACE_MODELS[@]}"; do
      if [ "${FACE_MODELS[$model]}" = "required" ]; then
        models_to_download+=("$model")
      fi
    done
  fi
  
  # Extract model info from manifest
  local success_count=0
  local fail_count=0
  local total_count=${#models_to_download[@]}
  
  log_info "Processing $total_count face recognition model(s)..."
  echo ""
  
  for model_id in "${models_to_download[@]}"; do
    local model_info=$(jq -r ".models[] | select(.id == \"$model_id\")" "$MANIFEST_FILE")
    
    if [ -z "$model_info" ] || [ "$model_info" = "null" ]; then
      log_error "Model not found in manifest: $model_id"
      ((fail_count++))
      continue
    fi
    
    local model_name=$(echo "$model_info" | jq -r '.name')
    local model_path=$(echo "$model_info" | jq -r '.path')
    local source_url=$(echo "$model_info" | jq -r '.sourceUrl')
    local sha256=$(echo "$model_info" | jq -r '.sha256')
    
    # Check for environment variable override
    local path_env=$(echo "$model_info" | jq -r '.pathEnvironment // empty')
    if [ -n "$path_env" ] && [ -n "${!path_env:-}" ]; then
      model_path="${!path_env}"
      log_info "Using environment override: $path_env=${model_path}"
    fi
    
    # Check for source URL environment override
    local source_env=$(echo "$model_info" | jq -r '.sourceUrlEnvironment // empty')
    if [ -n "$source_env" ] && [ -n "${!source_env:-}" ]; then
      source_url="${!source_env}"
      log_info "Using environment URL: $source_env"
    fi
    
    if [ "$VERIFY_ONLY" = true ]; then
      # Verify only mode
      local full_path="${MODELS_DIR}/${model_path}"
      if [ -f "$full_path" ]; then
        if verify_sha256 "$full_path" "$sha256"; then
          log_success "✓ $model_name verified"
          ((success_count++))
        else
          log_error "✗ $model_name verification failed"
          ((fail_count++))
        fi
      else
        log_warning "○ $model_name not found"
        ((fail_count++))
      fi
    else
      # Download mode
      if download_model "$model_id" "$model_name" "$model_path" "$source_url" "$sha256"; then
        ((success_count++))
      else
        ((fail_count++))
      fi
    fi
    
    echo ""
  done
  
  # Summary
  echo "========================================="
  if [ "$VERIFY_ONLY" = true ]; then
    log_info "Verification Summary:"
  else
    log_info "Provisioning Summary:"
  fi
  log_success "Success: $success_count/$total_count"
  if [ $fail_count -gt 0 ]; then
    log_error "Failed: $fail_count/$total_count"
  fi
  echo "========================================="
  
  return $fail_count
}

check_bfsi_compliance() {
  log_info "Checking BFSI compliance requirements..."
  
  local arcface_path="${MODELS_DIR}/face/arcface_r100.onnx"
  local liveness_path="${MODELS_DIR}/face/face-liveness.onnx"
  
  local compliance_issues=0
  
  # Check ArcFace model
  if [ ! -f "$arcface_path" ]; then
    log_warning "⚠ ArcFace R100 model not found - required for BFSI production"
    ((compliance_issues++))
  fi
  
  # Check liveness model
  if [ ! -f "$liveness_path" ]; then
    log_warning "⚠ Liveness detection model not found - recommended for BFSI"
    ((compliance_issues++))
  fi
  
  # Check BFSI readiness doc
  local bfsi_doc="${PROJECT_ROOT}/BFSI_PRODUCTION_READINESS.md"
  if [ ! -f "$bfsi_doc" ]; then
    log_warning "⚠ BFSI production readiness guide not found"
    ((compliance_issues++))
  else
    log_success "✓ BFSI production readiness guide present"
  fi
  
  if [ $compliance_issues -eq 0 ]; then
    log_success "✓ All BFSI compliance checks passed"
  else
    log_warning "⚠ $compliance_issues BFSI compliance issue(s) found"
    log_info "Review BFSI_PRODUCTION_READINESS.md before deploying"
  fi
  
  echo ""
}

display_next_steps() {
  echo "========================================="
  log_info "Next Steps:"
  echo ""
  echo "1. Verify model integrity:"
  echo "   ./scripts/provision-face-models.sh --verify-only"
  echo ""
  echo "2. Test face recognition:"
  echo "   npm run test:face-recognition"
  echo ""
  echo "3. Review BFSI compliance:"
  echo "   cat analytics-engine/BFSI_PRODUCTION_READINESS.md"
  echo ""
  echo "4. Configure environment variables:"
  echo "   cp .env.example .env"
  echo "   # Set ENABLE_FACE_RECOGNITION=true"
  echo ""
  echo "5. Start analytics engine:"
  echo "   npm run analytics:dev"
  echo "========================================="
}

# Main execution
main() {
  echo "========================================="
  log_info "Face Recognition Model Provisioning"
  log_info "Mode: $MODE"
  echo "========================================="
  echo ""
  
  # Check dependencies
  check_dependencies
  
  # Verify manifest exists
  if [ ! -f "$MANIFEST_FILE" ]; then
    log_error "Model manifest not found: $MANIFEST_FILE"
    exit 1
  fi
  
  # Create models directory
  mkdir -p "$MODELS_DIR/face"
  
  # Process models
  if process_face_models "$MODE"; then
    log_success "All models processed successfully"
    exit_code=0
  else
    log_error "Some models failed to process"
    exit_code=1
  fi
  
  echo ""
  
  # BFSI compliance check
  if [ "$VERIFY_ONLY" = false ]; then
    check_bfsi_compliance
  fi
  
  # Display next steps
  if [ "$VERIFY_ONLY" = false ] && [ $exit_code -eq 0 ]; then
    display_next_steps
  fi
  
  exit $exit_code
}

# Run main function
main
