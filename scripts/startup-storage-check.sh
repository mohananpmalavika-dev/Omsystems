#!/bin/bash
#
# Startup Storage Check - Ensures storage telemetry is always visible
#
# This script runs automatically during system startup to ensure
# storage data is present in the Predictive Operations dashboard.
#
# Add to systemd or cron:
#   @reboot /path/to/startup-storage-check.sh
#
# Or add to your application startup in package.json:
#   "start": "npm run ensure:storage && npm run start:server"
#

set -e

echo "═══════════════════════════════════════════════════════"
echo "  Startup Storage Telemetry Check"
echo "═══════════════════════════════════════════════════════"
echo ""

# Change to project directory
cd "$(dirname "$0")/.."

# Load environment variables
if [ -f .env ]; then
  echo "Loading environment variables..."
  export $(cat .env | grep -v '^#' | xargs)
fi

# Run the storage visibility check
echo "Running storage visibility enforcement..."
npm run ensure:storage

# Check exit code
if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Storage visibility check passed!"
  echo ""
  exit 0
else
  echo ""
  echo "⚠️  Storage visibility check failed!"
  echo "The system will continue to start, but storage may not be visible."
  echo ""
  # Don't fail startup, just warn
  exit 0
fi
