#!/bin/bash
# Script to delete all cameras and gateways from production database
# Usage: ./delete-all.sh <DATABASE_URL>

if [ -z "$1" ]; then
  echo "Usage: $0 <DATABASE_URL>"
  echo "Example: $0 'postgresql://user:pass@host:5432/dbname'"
  exit 1
fi

DATABASE_URL="$1"

echo "⚠️  WARNING: This will delete ALL cameras and gateways from the database!"
echo "Press Ctrl+C to cancel, or Enter to continue..."
read

echo "Checking current counts..."
psql "$DATABASE_URL" -c "SELECT COUNT(*) as camera_count FROM resource_nodes WHERE node_type = 'camera';"
psql "$DATABASE_URL" -c "SELECT COUNT(*) as gateway_count FROM resource_nodes WHERE node_type = 'gateway';"

echo ""
echo "Deleting records..."
psql "$DATABASE_URL" -f delete-cameras-gateways.sql

echo ""
echo "Done! Verifying deletion..."
psql "$DATABASE_URL" -c "SELECT COUNT(*) as remaining_cameras FROM resource_nodes WHERE node_type = 'camera';"
psql "$DATABASE_URL" -c "SELECT COUNT(*) as remaining_gateways FROM resource_nodes WHERE node_type = 'gateway';"
