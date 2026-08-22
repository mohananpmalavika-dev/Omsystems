#!/bin/bash

###############################################################################
# Cleanup Script for 400-Branch Scalability Test
#
# Removes test data and resets the environment
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DATABASE_URL=${DATABASE_URL:-"postgresql://postgres:postgres@localhost:5432/vms_test"}
NAMESPACE=${NAMESPACE:-"vms-test"}

echo -e "${YELLOW}================================================${NC}"
echo -e "${YELLOW}  Scalability Test Cleanup${NC}"
echo -e "${YELLOW}================================================${NC}"
echo ""
echo -e "${RED}WARNING: This will delete all test data!${NC}"
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Cleanup cancelled."
  exit 0
fi

echo ""
echo -e "${YELLOW}Cleaning up test data...${NC}"

# 1. Delete chaos experiments
echo -e "${YELLOW}Removing chaos experiments...${NC}"
kubectl delete networkchaos,podchaos,stresschaos,iochaos --all -n "$NAMESPACE" 2>/dev/null || true
echo -e "${GREEN}✓ Chaos experiments removed${NC}"

# 2. Truncate database tables
echo -e "${YELLOW}Truncating database tables...${NC}"
psql "$DATABASE_URL" <<'EOF'
BEGIN;

-- Disable triggers to avoid constraint issues
SET session_replication_role = replica;

-- Truncate test data tables
TRUNCATE TABLE analytics_alerts CASCADE;
TRUNCATE TABLE analytics_rules CASCADE;
TRUNCATE TABLE recording_segments CASCADE;
TRUNCATE TABLE cameras CASCADE;
TRUNCATE TABLE recorders CASCADE;
TRUNCATE TABLE branches CASCADE;
TRUNCATE TABLE regions CASCADE;
TRUNCATE TABLE users CASCADE;
TRUNCATE TABLE audit_logs CASCADE;
TRUNCATE TABLE system_metrics CASCADE;

-- Re-enable triggers
SET session_replication_role = DEFAULT;

COMMIT;

-- Vacuum tables to reclaim space
VACUUM ANALYZE;

SELECT 'Test data cleaned' AS status;
EOF

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Database cleaned${NC}"
else
  echo -e "${RED}✗ Database cleanup failed${NC}" >&2
  exit 1
fi

# 3. Clear Redis cache
echo -e "${YELLOW}Clearing Redis cache...${NC}"
REDIS_HOST=${REDIS_HOST:-"localhost"}
REDIS_PORT=${REDIS_PORT:-6379}

redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" FLUSHALL > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Redis cache cleared${NC}"
else
  echo -e "${YELLOW}⚠ Redis cache clear skipped (not running or not accessible)${NC}"
fi

# 4. Delete test result files (optional)
echo ""
read -p "Delete test result files in ./test-results/? (yes/no): " DELETE_RESULTS

if [ "$DELETE_RESULTS" = "yes" ]; then
  rm -rf ./test-results/*
  echo -e "${GREEN}✓ Test results deleted${NC}"
fi

# 5. Reset Kubernetes pods (optional)
echo ""
read -p "Restart all pods in namespace $NAMESPACE? (yes/no): " RESTART_PODS

if [ "$RESTART_PODS" = "yes" ]; then
  kubectl rollout restart deployment -n "$NAMESPACE"
  echo -e "${GREEN}✓ Pods restarting${NC}"
fi

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  Cleanup Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "Environment has been reset."
echo "You can now run a new test with:"
echo "  npm run test:scalability:setup"
echo "  npm run test:scalability:full"
echo ""
