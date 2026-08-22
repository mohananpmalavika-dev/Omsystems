#!/bin/bash
# Quick Camera and Edge Agent Deletion Script
# 
# Usage:
#   ./quick-delete-cameras.sh                    # Delete all
#   ./quick-delete-cameras.sh <tenant-id>        # Delete for specific tenant
#   
# Environment Variables:
#   DB_HOST (default: localhost)
#   DB_PORT (default: 5432)
#   DB_NAME (default: omsystems)
#   DB_USER (default: postgres)
#   DB_PASSWORD (default: postgres)

set -e

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-omsystems}"
DB_USER="${DB_USER:-postgres}"

TENANT_ID="${1:-}"

echo "============================================================"
echo "QUICK DELETE: Cameras and Edge Agents"
echo "============================================================"
echo ""

if [ -n "$TENANT_ID" ]; then
  echo "Tenant: $TENANT_ID"
else
  echo "Scope: ALL TENANTS"
fi

echo ""
echo "⚠️  WARNING: This will permanently delete data!"
echo ""
read -p "Type 'yes' to continue: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Cancelled."
  exit 0
fi

echo ""
echo "Deleting..."

# Build SQL
SQL="
BEGIN;

-- Delete live sessions
DELETE FROM live_sessions
WHERE camera_id IN (
  SELECT c.id FROM cameras c
  JOIN resource_nodes rn ON c.resource_node_id = rn.id
  $([ -n "$TENANT_ID" ] && echo "WHERE rn.tenant_id = '$TENANT_ID'")
);

-- Delete incident_cameras (if exists)
DO \$\$
BEGIN
  DELETE FROM incident_cameras
  WHERE camera_id IN (
    SELECT c.id FROM cameras c
    JOIN resource_nodes rn ON c.resource_node_id = rn.id
    $([ -n "$TENANT_ID" ] && echo "WHERE rn.tenant_id = '$TENANT_ID'")
  );
EXCEPTION
  WHEN undefined_table THEN NULL;
END \$\$;

-- Delete camera discoveries
DELETE FROM camera_discoveries
$([ -n "$TENANT_ID" ] && echo "WHERE tenant_id = '$TENANT_ID'");

-- Delete cameras
DELETE FROM cameras
WHERE id IN (
  SELECT c.id FROM cameras c
  JOIN resource_nodes rn ON c.resource_node_id = rn.id
  $([ -n "$TENANT_ID" ] && echo "WHERE rn.tenant_id = '$TENANT_ID'")
);

-- Delete camera resource nodes
DELETE FROM resource_nodes
WHERE node_type = 'camera'
$([ -n "$TENANT_ID" ] && echo "AND tenant_id = '$TENANT_ID'");

-- Delete edge agents
DELETE FROM edge_agents
$([ -n "$TENANT_ID" ] && echo "WHERE tenant_id = '$TENANT_ID'");

COMMIT;

-- Show results
SELECT
  (SELECT COUNT(*) FROM cameras c 
   JOIN resource_nodes rn ON c.resource_node_id = rn.id
   $([ -n "$TENANT_ID" ] && echo "WHERE rn.tenant_id = '$TENANT_ID'")) as remaining_cameras,
  (SELECT COUNT(*) FROM edge_agents
   $([ -n "$TENANT_ID" ] && echo "WHERE tenant_id = '$TENANT_ID'")) as remaining_edge_agents;
"

# Execute
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "$SQL"

echo ""
echo "✓ Deletion complete."
echo ""
