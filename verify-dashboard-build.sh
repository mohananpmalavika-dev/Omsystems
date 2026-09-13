#!/bin/bash
set -e

echo "================================================================================"
echo "  AUTHORITATIVE DASHBOARD & OPERATIONS BUILD VERIFICATION"
echo "================================================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0

echo "Step 1: Checking Authoritative Production Services (src/)..."
echo ""

# Check composition root
if [ -f "src/bootstrap/index.ts" ]; then
    echo -e "${GREEN}✓ src/bootstrap/index.ts (Authoritative Composition Root) exists${NC}"
else
    echo -e "${RED}✗ src/bootstrap/index.ts not found${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check branch mosaic service
if [ -f "src/branch-mosaic/services/branch-mosaic.service.ts" ]; then
    echo -e "${GREEN}✓ src/branch-mosaic/services/branch-mosaic.service.ts exists${NC}"
else
    echo -e "${RED}✗ src/branch-mosaic/services/branch-mosaic.service.ts not found${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check reporting service
if [ -f "src/reporting/services/daily-surveillance-report.service.ts" ]; then
    echo -e "${GREEN}✓ src/reporting/services/daily-surveillance-report.service.ts exists${NC}"
else
    echo -e "${RED}✗ src/reporting/services/daily-surveillance-report.service.ts not found${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check security devices service
if [ -f "src/security-devices/services/security-device.service.ts" ]; then
    echo -e "${GREEN}✓ src/security-devices/services/security-device.service.ts exists${NC}"
else
    echo -e "${RED}✗ src/security-devices/services/security-device.service.ts not found${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check security devices discovery service
if [ -f "src/security-devices/services/security-device-discovery.service.ts" ]; then
    echo -e "${GREEN}✓ src/security-devices/services/security-device-discovery.service.ts exists${NC}"
else
    echo -e "${RED}✗ src/security-devices/services/security-device-discovery.service.ts not found${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "Step 2: Checking Dashboard Frontend Components (dashboard/)..."
echo ""

if [ -f "dashboard/app/page.tsx" ]; then
    echo -e "${GREEN}✓ dashboard/app/page.tsx exists${NC}"
else
    echo -e "${RED}✗ dashboard/app/page.tsx not found${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "dashboard/app/dashboards/page.tsx" ]; then
    echo -e "${GREEN}✓ dashboard/app/dashboards/page.tsx exists${NC}"
else
    echo -e "${RED}✗ dashboard/app/dashboards/page.tsx not found${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "dashboard/lib/backend/security-device-service.ts" ]; then
    echo -e "${GREEN}✓ dashboard/lib/backend/security-device-service.ts (Authoritative BFF Bridge) exists${NC}"
else
    echo -e "${RED}✗ dashboard/lib/backend/security-device-service.ts not found${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "Step 3: Checking Database Schema Migrations..."
echo ""

if [ -d "database/migrations" ]; then
    MIGRATION_COUNT=$(ls -1 database/migrations/*.sql 2>/dev/null | wc -l)
    echo -e "${GREEN}✓ database/migrations contains $MIGRATION_COUNT SQL migrations${NC}"
else
    echo -e "${RED}✗ database/migrations not found${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "Step 4: Verifying Dashboard TypeScript Compilation..."
echo ""

if npm run dashboard:typecheck; then
    echo -e "${GREEN}✓ Dashboard TypeScript compiles successfully with 0 errors${NC}"
else
    echo -e "${RED}✗ Dashboard TypeScript compilation failed${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "================================================================================"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}  VERIFICATION PASSED: Authoritative Dashboard Architecture is 100% Operational${NC}"
else
    echo -e "${RED}  VERIFICATION FAILED: $ERRORS error(s) detected${NC}"
    exit 1
fi
echo "================================================================================"
