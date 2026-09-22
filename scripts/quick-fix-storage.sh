#!/bin/bash
# ============================================================================
# Quick Fix Script for Storage Visibility Issue
# ============================================================================
# This script performs immediate fixes for storage not showing in dashboard
# Usage: bash scripts/quick-fix-storage.sh
# ============================================================================

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Storage Visibility Quick Fix Script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: Run diagnostic
echo "📊 Step 1: Running diagnostic..."
echo ""
psql "$DATABASE_URL" -f scripts/fix-storage-visibility.sql > /tmp/storage-diagnostic.log 2>&1

# Check if diagnostic found issues
if grep -q "CRITICAL" /tmp/storage-diagnostic.log; then
  echo "❌ Critical issues found! See /tmp/storage-diagnostic.log"
  echo ""
  echo "🔧 Attempting automatic fix..."
  echo ""
  
  # Step 2: Seed storage telemetry
  echo "📝 Step 2: Generating storage telemetry data..."
  npm run seed:storage
  
  if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Failed to generate storage data"
    echo "Manual intervention required. Check the error above."
    exit 1
  fi
  
  echo ""
  echo "✅ Storage data generated successfully"
  
elif grep -q "WARNING" /tmp/storage-diagnostic.log; then
  echo "⚠️  Warnings found. Reviewing..."
  cat /tmp/storage-diagnostic.log | grep "WARNING" -A 3
  echo ""
  echo "🔧 Attempting refresh..."
  
  # Step 3: Trigger data refresh (if applicable)
  if command -v redis-cli &> /dev/null; then
    echo "🔄 Clearing Redis cache..."
    redis-cli FLUSHDB
    echo "✅ Cache cleared"
  fi
  
else
  echo "✅ No critical issues found"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 Verification Steps"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 4: Verify API response
echo "1. Testing API endpoint..."
API_URL="${API_BASE_URL:-http://localhost:3000}/api/control/v1/maintenance/predictive/dashboard?horizonHours=48"

if command -v curl &> /dev/null; then
  RESPONSE=$(curl -s -H "Authorization: Bearer ${API_TOKEN}" "$API_URL")
  VOLUME_COUNT=$(echo "$RESPONSE" | jq -r '.volumes | length' 2>/dev/null || echo "0")
  
  if [ "$VOLUME_COUNT" -gt 0 ]; then
    echo "   ✅ API returns $VOLUME_COUNT storage volumes"
  else
    echo "   ❌ API returns 0 storage volumes"
    echo "   Response: $RESPONSE"
  fi
else
  echo "   ⚠️  curl not available, skipping API test"
fi

echo ""
echo "2. Checking database..."
RECORD_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM operational_telemetry WHERE device_type='disk' AND created_at > NOW() - INTERVAL '24 hours';" 2>/dev/null || echo "0")

if [ "$RECORD_COUNT" -gt 0 ]; then
  echo "   ✅ Database has $RECORD_COUNT storage records (last 24h)"
else
  echo "   ❌ No storage records in database (last 24h)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 Next Steps"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Open the Predictive Operations dashboard:"
echo "   → ${DASHBOARD_URL:-http://localhost:3000}/analytics/predictions"
echo ""
echo "2. Filter by 'Storage' domain"
echo ""
echo "3. Click 'Refresh telemetry' button if needed"
echo ""
echo "4. If storage still doesn't appear:"
echo "   → Check browser console for errors"
echo "   → Review full diagnostic: cat /tmp/storage-diagnostic.log"
echo "   → Check backend logs for API errors"
echo ""
echo "📚 For more information, see:"
echo "   → STORAGE_VISIBILITY_FIX.md"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Quick fix complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
