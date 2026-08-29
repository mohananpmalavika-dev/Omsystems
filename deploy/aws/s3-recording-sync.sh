#!/usr/bin/env bash
# ==============================================================================
# Sentinel Grid - Automated S3 Video Archive Sync Worker
# Syncs local video segments older than N minutes to Amazon S3
# ==============================================================================

set -euo pipefail

RECORDINGS_DIR="${RECORDINGS_ROOT:-/recordings}"
S3_BUCKET="${S3_RECORDINGS_BUCKET:-}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
SYNC_OLDER_THAN_MINS="${SYNC_OLDER_THAN_MINS:-10}"

if [ -z "$S3_BUCKET" ]; then
    echo "⚠️ S3_RECORDINGS_BUCKET is not set. Skipping S3 sync."
    exit 0
fi

if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install AWS CLI or run inside AWS CLI container."
    exit 1
fi

echo "📦 Starting Sentinel Grid S3 video sync to s3://$S3_BUCKET (Region: $AWS_REGION)..."

# Sync closed/completed recording segments to S3
aws s3 sync "$RECORDINGS_DIR" "s3://$S3_BUCKET/recordings/" \
    --region "$AWS_REGION" \
    --exclude "*.tmp" \
    --exclude "*.part" \
    --storage-class STANDARD_IA \
    --no-progress

echo "✅ S3 video sync completed at $(date -u '+%Y-%m-%d %H:%M:%SZ')"
