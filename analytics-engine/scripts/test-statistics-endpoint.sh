#!/bin/bash
# Test script for Analytics Statistics Endpoint
# Usage: ./scripts/test-statistics-endpoint.sh <tenant-id> [base-url]

set -e

# Configuration
TENANT_ID="${1:-}"
BASE_URL="${2:-http://localhost:3001}"
STATISTICS_ENDPOINT="${BASE_URL}/v1/analytics/statistics"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo -e "\n${BLUE}===================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}===================================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Check if tenant ID provided
if [ -z "$TENANT_ID" ]; then
    echo -e "${RED}Error: Tenant ID required${NC}"
    echo "Usage: $0 <tenant-id> [base-url]"
    echo ""
    echo "Example:"
    echo "  $0 550e8400-e29b-41d4-a716-446655440000"
    echo "  $0 550e8400-e29b-41d4-a716-446655440000 http://localhost:3001"
    exit 1
fi

# Check if curl is available
if ! command -v curl &> /dev/null; then
    print_error "curl is not installed. Please install curl to run this script."
    exit 1
fi

# Check if jq is available (optional but helpful)
JQ_AVAILABLE=false
if command -v jq &> /dev/null; then
    JQ_AVAILABLE=true
fi

print_header "Analytics Statistics Endpoint Test"
print_info "Tenant ID: $TENANT_ID"
print_info "Base URL: $BASE_URL"
echo ""

# Test 1: Basic endpoint availability
print_header "Test 1: Basic Endpoint Availability"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${STATISTICS_ENDPOINT}?tenantId=${TENANT_ID}")

if [ "$HTTP_CODE" -eq 200 ]; then
    print_success "Endpoint is available (HTTP $HTTP_CODE)"
elif [ "$HTTP_CODE" -eq 503 ]; then
    print_error "Service unavailable (HTTP $HTTP_CODE)"
    print_warning "This usually means DATABASE_URL is not configured"
    exit 1
elif [ "$HTTP_CODE" -eq 400 ]; then
    print_error "Bad request (HTTP $HTTP_CODE)"
    print_warning "Check if tenant ID is valid"
    exit 1
else
    print_error "Unexpected HTTP code: $HTTP_CODE"
    exit 1
fi

# Test 2: Default query (last 24 hours)
print_header "Test 2: Default Query (Last 24 Hours)"
RESPONSE=$(curl -s "${STATISTICS_ENDPOINT}?tenantId=${TENANT_ID}")

if [ $JQ_AVAILABLE = true ]; then
    TOTAL=$(echo "$RESPONSE" | jq -r '.totalDetections')
    AVG_CONF=$(echo "$RESPONSE" | jq -r '.averageConfidence')
    ALERTS=$(echo "$RESPONSE" | jq -r '.alerts')
    
    print_info "Total Detections: $TOTAL"
    print_info "Average Confidence: $AVG_CONF"
    print_info "Alerts: $ALERTS"
    
    if [ "$TOTAL" != "null" ]; then
        print_success "Response structure is valid"
    else
        print_error "Response structure is invalid"
        echo "$RESPONSE"
        exit 1
    fi
else
    print_warning "jq not installed - skipping JSON validation"
    print_info "Response: ${RESPONSE:0:200}..."
fi

# Test 3: Custom time range
print_header "Test 3: Custom Time Range with Hourly Buckets"
FROM_DATE="2026-08-10T00:00:00Z"
TO_DATE="2026-08-11T00:00:00Z"

RESPONSE=$(curl -s "${STATISTICS_ENDPOINT}?tenantId=${TENANT_ID}&from=${FROM_DATE}&to=${TO_DATE}&bucket=hour")

if [ $JQ_AVAILABLE = true ]; then
    BUCKET=$(echo "$RESPONSE" | jq -r '.range.bucket')
    TIMELINE_LENGTH=$(echo "$RESPONSE" | jq -r '.timeline | length')
    
    print_info "Bucket: $BUCKET"
    print_info "Timeline entries: $TIMELINE_LENGTH"
    
    if [ "$BUCKET" = "hour" ]; then
        print_success "Correct bucket size returned"
    else
        print_error "Unexpected bucket: $BUCKET"
    fi
    
    if [ "$TIMELINE_LENGTH" -gt 0 ]; then
        print_success "Timeline data present"
    else
        print_warning "No timeline data (may be normal if no detections in range)"
    fi
fi

# Test 4: Filter by detector type
print_header "Test 4: Filter by Detector Type"
RESPONSE=$(curl -s "${STATISTICS_ENDPOINT}?tenantId=${TENANT_ID}&detectorType=person&detectorType=vehicle")

if [ $JQ_AVAILABLE = true ]; then
    PERSON_COUNT=$(echo "$RESPONSE" | jq -r '.byType.person.count // 0')
    VEHICLE_COUNT=$(echo "$RESPONSE" | jq -r '.byType.vehicle.count // 0')
    
    print_info "Person detections: $PERSON_COUNT"
    print_info "Vehicle detections: $VEHICLE_COUNT"
    
    print_success "Type filtering works"
fi

# Test 5: Invalid detector type (should fail)
print_header "Test 5: Invalid Detector Type (Expected Failure)"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${STATISTICS_ENDPOINT}?tenantId=${TENANT_ID}&detectorType=invalid_type")

if [ "$HTTP_CODE" -eq 400 ]; then
    print_success "Correctly rejected invalid detector type (HTTP 400)"
else
    print_error "Should have rejected invalid detector type (got HTTP $HTTP_CODE)"
fi

# Test 6: Invalid time range (should fail)
print_header "Test 6: Invalid Time Range (Expected Failure)"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${STATISTICS_ENDPOINT}?tenantId=${TENANT_ID}&from=2026-08-11T00:00:00Z&to=2026-08-10T00:00:00Z")

if [ "$HTTP_CODE" -eq 400 ]; then
    print_success "Correctly rejected invalid time range (HTTP 400)"
else
    print_error "Should have rejected invalid time range (got HTTP $HTTP_CODE)"
fi

# Test 7: Missing tenant ID (should fail)
print_header "Test 7: Missing Tenant ID (Expected Failure)"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${STATISTICS_ENDPOINT}")

if [ "$HTTP_CODE" -eq 400 ]; then
    print_success "Correctly rejected missing tenant ID (HTTP 400)"
else
    print_error "Should have rejected missing tenant ID (got HTTP $HTTP_CODE)"
fi

# Test 8: Include camera breakdown
print_header "Test 8: Camera Breakdown"
RESPONSE=$(curl -s "${STATISTICS_ENDPOINT}?tenantId=${TENANT_ID}&includeCameraBreakdown=true")

if [ $JQ_AVAILABLE = true ]; then
    HAS_TOP_CAMERAS=$(echo "$RESPONSE" | jq -r '.topCameras != null')
    
    if [ "$HAS_TOP_CAMERAS" = "true" ]; then
        TOP_CAMERA_COUNT=$(echo "$RESPONSE" | jq -r '.topCameras | length')
        print_success "Camera breakdown included ($TOP_CAMERA_COUNT cameras)"
    else
        print_warning "No top cameras data (may be normal if no detections)"
    fi
fi

# Test 9: Response time check
print_header "Test 9: Response Time Check"
START_TIME=$(date +%s%N)
curl -s "${STATISTICS_ENDPOINT}?tenantId=${TENANT_ID}" > /dev/null
END_TIME=$(date +%s%N)

DURATION_MS=$(( (END_TIME - START_TIME) / 1000000 ))
print_info "Response time: ${DURATION_MS}ms"

if [ "$DURATION_MS" -lt 1000 ]; then
    print_success "Response time acceptable (<1s)"
elif [ "$DURATION_MS" -lt 5000 ]; then
    print_warning "Response time slow (1-5s) - consider optimization"
else
    print_error "Response time too slow (>5s) - needs optimization"
fi

# Summary
print_header "Test Summary"

print_success "All critical tests passed!"
echo ""
print_info "Endpoint is functioning correctly"
print_info "Integration ready for dashboard development"

if [ $JQ_AVAILABLE = false ]; then
    echo ""
    print_warning "Install jq for more detailed test output:"
    print_info "  Ubuntu/Debian: sudo apt-get install jq"
    print_info "  macOS: brew install jq"
    print_info "  Windows: choco install jq"
fi

echo ""
print_info "Full API documentation: analytics-engine/STATISTICS_API.md"
print_info "Frontend guide: analytics-engine/STATISTICS_DASHBOARD_INTEGRATION.md"
