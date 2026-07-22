#!/bin/bash

echo "=== Dashboard & Reports Module Build Verification ==="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if backend directory exists
if [ ! -d "backend/src/services" ]; then
    echo -e "${RED}✗ Backend directory not found${NC}"
    exit 1
fi

echo "Step 1: Checking TypeScript files..."
echo ""

# Check dashboard service
if [ -f "backend/src/services/dashboard.service.ts" ]; then
    echo -e "${GREEN}✓ dashboard.service.ts exists${NC}"
    if grep -q "constructor(private pool: Pool)" "backend/src/services/dashboard.service.ts"; then
        echo -e "${GREEN}  ✓ Uses dependency injection pattern${NC}"
    else
        echo -e "${RED}  ✗ Missing dependency injection${NC}"
    fi
else
    echo -e "${RED}✗ dashboard.service.ts not found${NC}"
fi

# Check reports service
if [ -f "backend/src/services/reports.service.ts" ]; then
    echo -e "${GREEN}✓ reports.service.ts exists${NC}"
    if grep -q "constructor(private pool: Pool)" "backend/src/services/reports.service.ts"; then
        echo -e "${GREEN}  ✓ Uses dependency injection pattern${NC}"
    else
        echo -e "${RED}  ✗ Missing dependency injection${NC}"
    fi
else
    echo -e "${RED}✗ reports.service.ts not found${NC}"
fi

# Check dashboard routes
if [ -f "backend/src/routes/dashboard.routes.ts" ]; then
    echo -e "${GREEN}✓ dashboard.routes.ts exists${NC}"
    if grep -q "export function createDashboardRoutes" "backend/src/routes/dashboard.routes.ts"; then
        echo -e "${GREEN}  ✓ Uses factory function pattern${NC}"
    else
        echo -e "${RED}  ✗ Missing factory function${NC}"
    fi
else
    echo -e "${RED}✗ dashboard.routes.ts not found${NC}"
fi

# Check reports routes
if [ -f "backend/src/routes/reports.routes.ts" ]; then
    echo -e "${GREEN}✓ reports.routes.ts exists${NC}"
    if grep -q "export function createReportsRoutes" "backend/src/routes/reports.routes.ts"; then
        echo -e "${GREEN}  ✓ Uses factory function pattern${NC}"
    else
        echo -e "${RED}  ✗ Missing factory function${NC}"
    fi
else
    echo -e "${RED}✗ reports.routes.ts not found${NC}"
fi

echo ""
echo "Step 2: Checking database migration..."
echo ""

if [ -f "database/migrations/20260723_reporting_dashboard_schema.sql" ]; then
    echo -e "${GREEN}✓ Dashboard schema migration exists${NC}"
    
    # Count tables to be created
    table_count=$(grep -c "CREATE TABLE" "database/migrations/20260723_reporting_dashboard_schema.sql")
    echo -e "${GREEN}  ✓ Creates $table_count tables${NC}"
else
    echo -e "${RED}✗ Dashboard schema migration not found${NC}"
fi

echo ""
echo "Step 3: Checking frontend dashboard..."
echo ""

if [ -f "dashboard/app/dashboards/page.tsx" ]; then
    echo -e "${GREEN}✓ Dashboard page component exists${NC}"
else
    echo -e "${RED}✗ Dashboard page component not found${NC}"
fi

if [ -f "dashboard/lib/api-client.ts" ]; then
    echo -e "${GREEN}✓ API client exists${NC}"
    if grep -q "dashboardApi" "dashboard/lib/api-client.ts"; then
        echo -e "${GREEN}  ✓ Dashboard API methods present${NC}"
    else
        echo -e "${YELLOW}  ⚠ Dashboard API methods may be missing${NC}"
    fi
else
    echo -e "${RED}✗ API client not found${NC}"
fi

echo ""
echo "Step 4: Testing TypeScript compilation..."
echo ""

cd backend 2>/dev/null
if [ $? -eq 0 ]; then
    echo "Attempting to compile backend TypeScript..."
    if npx tsc --noEmit 2>&1 | grep -q "error TS"; then
        echo -e "${RED}✗ TypeScript compilation has errors${NC}"
        echo ""
        echo "Run 'cd backend && npx tsc --noEmit' to see details"
    else
        echo -e "${GREEN}✓ Backend TypeScript compiles successfully${NC}"
    fi
    cd ..
else
    echo -e "${YELLOW}⚠ Could not enter backend directory${NC}"
fi

echo ""
echo "=== Summary ==="
echo ""
echo "Next steps:"
echo "1. Register routes in main application"
echo "2. Run database migration"
echo "3. Build and test"
echo ""
echo "For detailed instructions, see:"
echo "  - DASHBOARD_BUILD_FIX_SUMMARY.md"
echo "  - DASHBOARD_INTEGRATION_CHECKLIST.md"
echo ""
