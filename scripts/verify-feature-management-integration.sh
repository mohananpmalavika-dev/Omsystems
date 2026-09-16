#!/bin/bash

# Feature Management Integration Verification Script
# Checks if all components are properly integrated

echo "🔍 Verifying Feature Management Integration..."
echo ""

ERRORS=0

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
    else
        echo -e "${RED}✗${NC} $1 - MISSING"
        ERRORS=$((ERRORS + 1))
    fi
}

check_content() {
    if grep -q "$2" "$1" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $3"
    else
        echo -e "${RED}✗${NC} $3 - NOT FOUND"
        ERRORS=$((ERRORS + 1))
    fi
}

echo "📁 Backend Files:"
check_file "migrations/020_feature_management.sql"
check_file "src/services/feature-management.service.ts"
check_file "src/routes/feature-management.routes.ts"
check_file "src/middleware/feature-flag.middleware.ts"
check_file "src/decorators/feature-protected.decorator.ts"
echo ""

echo "🎨 Frontend Files:"
check_file "dashboard/components/admin/feature-management.tsx"
check_file "dashboard/components/feature-status-badge.tsx"
check_file "dashboard/app/admin/features/page.tsx"
check_file "dashboard/app/settings/features/page.tsx"
echo ""

echo "📝 Documentation:"
check_file "FEATURE_MANAGEMENT_GUIDE.md"
check_file "FEATURE_MANAGEMENT_SUMMARY.md"
check_file "MENU_INTEGRATION_COMPLETE.md"
echo ""

echo "🔧 Integration Checks:"
check_content "src/app.ts" "registerFeatureManagementRoutes" "API routes registered in app.ts"
check_content "src/app.ts" "initializeFeatureMiddleware" "Middleware initialized in app.ts"
check_content "dashboard/components/app-layout.tsx" "Feature Management" "Menu item added to navigation"
check_content "dashboard/components/app-layout.tsx" "ToggleLeft" "ToggleLeft icon imported"
check_content "src/routes/guardian-ai.routes.ts" "requireFeatureWithLogging" "Guardian AI protected"
check_content "src/routes/ai-video-search-v2.routes.ts" "requireFeatureWithLogging" "AI Video Search protected"
echo ""

echo "📊 Database Schema:"
check_content "migrations/020_feature_management.sql" "global_features" "global_features table"
check_content "migrations/020_feature_management.sql" "tenant_features" "tenant_features table"
check_content "migrations/020_feature_management.sql" "feature_usage_logs" "feature_usage_logs table"
check_content "migrations/020_feature_management.sql" "is_feature_enabled" "is_feature_enabled function"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Feature Management is fully integrated.${NC}"
    echo ""
    echo "🚀 Next Steps:"
    echo "   1. Run database migration:"
    echo "      psql \$DATABASE_URL -f migrations/020_feature_management.sql"
    echo ""
    echo "   2. Start the application:"
    echo "      npm run dev"
    echo ""
    echo "   3. Access Feature Management:"
    echo "      http://localhost:3000/admin/features"
    echo ""
    exit 0
else
    echo -e "${RED}❌ $ERRORS check(s) failed. Please review the errors above.${NC}"
    exit 1
fi
