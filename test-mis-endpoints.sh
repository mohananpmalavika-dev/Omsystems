#!/bin/bash

#############################################################################
# MIS Reports API Testing Script
# 
# Tests all Phase 1 MIS report endpoints
# Usage: ./test-mis-endpoints.sh [token]
#############################################################################

# Configuration
API_URL="${API_URL:-http://localhost:3000/api/control/v1/reports}"
TOKEN="${1:-YOUR_AUTH_TOKEN_HERE}"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASS_COUNT=0
FAIL_COUNT=0
TOTAL_TESTS=6

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   MIS Reports API Testing Suite${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "API URL: $API_URL"
echo "Auth: ${TOKEN:0:20}..."
echo ""

#############################################################################
# Helper Functions
#############################################################################

test_endpoint() {
  local name="$1"
  local endpoint="$2"
  local test_num="$3"
  
  echo -e "${YELLOW}[$test_num/$TOTAL_TESTS]${NC} Testing $name..."
  
  # Make request and capture response
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    "$API_URL/$endpoint")
  
  # Extract HTTP code and body
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  
  # Check if response is valid JSON
  if echo "$BODY" | jq . >/dev/null 2>&1; then
    HAS_VALID_JSON=true
  else
    HAS_VALID_JSON=false
  fi
  
  # Determine pass/fail
  if [ "$HTTP_CODE" -eq 200 ] && [ "$HAS_VALID_JSON" = true ]; then
    echo -e "  ${GREEN}✓ PASS${NC} (HTTP $HTTP_CODE, Valid JSON)"
    PASS_COUNT=$((PASS_COUNT + 1))
    
    # Show sample data
    if command -v jq >/dev/null 2>&1; then
      echo -e "  ${BLUE}Sample:${NC} $(echo "$BODY" | jq -c 'keys' 2>/dev/null | head -c 80)..."
    fi
  else
    echo -e "  ${RED}✗ FAIL${NC} (HTTP $HTTP_CODE, Valid JSON: $HAS_VALID_JSON)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    
    # Show error details
    if [ "$HTTP_CODE" -ne 200 ]; then
      echo -e "  ${RED}Error:${NC} $(echo "$BODY" | jq -r '.error // .message // .' 2>/dev/null | head -c 100)"
    fi
  fi
  
  echo ""
}

#############################################################################
# Run Tests
#############################################################################

# Test 1: Executive KPI Dashboard
test_endpoint "Executive KPI Dashboard" "executive-kpi" 1

# Test 2: Financial TCO
test_endpoint "Financial TCO Report" "financial/tco" 2

# Test 3: Financial ROI
test_endpoint "Financial ROI Report" "financial/roi" 3

# Test 4: Branch Benchmarking
test_endpoint "Branch Benchmarking Report" "branch-benchmarking" 4

# Test 5: Compliance Scorecard
test_endpoint "Compliance Scorecard Report" "compliance-scorecard" 5

# Test 6: MIS Unified Report (NEW)
test_endpoint "MIS Unified Report" "mis" 6

#############################################################################
# Test Summary
#############################################################################

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Test Results${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Total Tests: $TOTAL_TESTS"
echo -e "Passed:      ${GREEN}$PASS_COUNT${NC}"
echo -e "Failed:      ${RED}$FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  echo ""
  echo "Deployment Status: ✅ READY FOR PRODUCTION"
  exit 0
else
  echo -e "${RED}✗ Some tests failed!${NC}"
  echo ""
  echo "Please review the errors above and fix before deploying."
  echo ""
  echo "Common Issues:"
  echo "  1. Routes not registered (check src/app.ts)"
  echo "  2. Database indexes not created (run migrations)"
  echo "  3. Invalid authentication token"
  echo "  4. Backend server not running"
  exit 1
fi
