#!/bin/bash

###############################################################################
# Full 400-Branch Scalability Test Runner
#
# Executes all test phases in sequence:
# 1. Baseline Performance (2 hours)
# 2. Stress Testing (4 hours)
# 3. Failure Scenarios (4 hours)
# 4. Sustained Load (24 hours)
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
RESULTS_DIR=${RESULTS_DIR:-"./test-results/$(date +%Y%m%d-%H%M%S)"}
API_URL=${API_URL:-"http://localhost:3000"}
NAMESPACE=${NAMESPACE:-"vms-test"}

echo -e "${BLUE}========================================================${NC}"
echo -e "${BLUE}  400-Branch Scalability Test - Full Suite${NC}"
echo -e "${BLUE}========================================================${NC}"
echo ""
echo "Test Configuration:"
echo "  Results directory: $RESULTS_DIR"
echo "  API URL: $API_URL"
echo "  Kubernetes namespace: $NAMESPACE"
echo "  Total duration: ~34 hours"
echo ""

# Create results directory
mkdir -p "$RESULTS_DIR"

# Initialize test log
TEST_LOG="$RESULTS_DIR/test-execution.log"
echo "Test started at: $(date)" > "$TEST_LOG"

# Function to log with timestamp
log() {
  local message="$1"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $message" | tee -a "$TEST_LOG"
}

# Function to run health check
run_health_check() {
  log "Running health check..."
  bash test/scalability/health-check.sh > "$RESULTS_DIR/health-check-$(date +%H%M%S).log" 2>&1
  if [ $? -eq 0 ]; then
    log "✓ Health check passed"
    return 0
  else
    log "✗ Health check failed"
    return 1
  fi
}

# Function to collect metrics
collect_metrics() {
  local phase="$1"
  log "Collecting metrics for $phase..."
  
  # Export Prometheus metrics
  curl -s "$API_URL/metrics" > "$RESULTS_DIR/${phase}-metrics.txt"
  
  # Get Kubernetes pod status
  kubectl get pods -n "$NAMESPACE" -o wide > "$RESULTS_DIR/${phase}-pods.txt"
  
  # Get resource usage
  kubectl top pods -n "$NAMESPACE" > "$RESULTS_DIR/${phase}-resources.txt" 2>/dev/null || true
  
  log "✓ Metrics collected"
}

###############################################################################
# Pre-flight checks
###############################################################################
echo -e "${YELLOW}Running pre-flight checks...${NC}"

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
  echo -e "${RED}ERROR: k6 is required but not installed${NC}" >&2
  echo "Install from: https://k6.io/docs/getting-started/installation/"
  exit 1
fi

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
  echo -e "${RED}ERROR: kubectl is required but not installed${NC}" >&2
  exit 1
fi

# Check API availability
if ! curl -sf "$API_URL/health" > /dev/null; then
  echo -e "${RED}ERROR: API is not accessible at $API_URL${NC}" >&2
  exit 1
fi

# Run initial health check
if ! run_health_check; then
  echo -e "${RED}ERROR: Initial health check failed${NC}" >&2
  echo "Please fix issues before running the test."
  exit 1
fi

echo -e "${GREEN}✓ Pre-flight checks passed${NC}"
echo ""

# Start monitoring in background
log "Starting continuous health monitoring..."
while true; do
  sleep 300  # Every 5 minutes
  run_health_check
done &
HEALTH_CHECK_PID=$!

# Trap to cleanup on exit
cleanup() {
  log "Cleaning up..."
  kill $HEALTH_CHECK_PID 2>/dev/null || true
  
  # Generate final report
  log "Generating test report..."
  bash test/scalability/generate-report.sh "$RESULTS_DIR" > "$RESULTS_DIR/REPORT.md"
  
  echo ""
  echo -e "${BLUE}========================================================${NC}"
  echo -e "${BLUE}  Test Complete!${NC}"
  echo -e "${BLUE}========================================================${NC}"
  echo ""
  echo "Results saved to: $RESULTS_DIR"
  echo "View report: $RESULTS_DIR/REPORT.md"
  echo ""
}

trap cleanup EXIT

###############################################################################
# Phase 1: Baseline Performance (2 hours)
###############################################################################
echo -e "${BLUE}========================================================${NC}"
echo -e "${BLUE}  Phase 1: Baseline Performance (2 hours)${NC}"
echo -e "${BLUE}========================================================${NC}"
echo ""

log "Starting Phase 1: Baseline Performance"
collect_metrics "phase1-start"

k6 run \
  --out json="$RESULTS_DIR/phase1-results.json" \
  --duration 2h \
  --vus 20 \
  --tag phase=baseline \
  test/scalability/user-simulation.js 2>&1 | tee "$RESULTS_DIR/phase1-output.log"

PHASE1_EXIT=$?
collect_metrics "phase1-end"

if [ $PHASE1_EXIT -eq 0 ]; then
  log "✓ Phase 1 completed successfully"
  echo -e "${GREEN}✓ Phase 1: PASS${NC}"
else
  log "✗ Phase 1 failed with exit code $PHASE1_EXIT"
  echo -e "${RED}✗ Phase 1: FAIL${NC}"
  echo "Check logs in: $RESULTS_DIR/phase1-output.log"
  exit 1
fi

echo ""
sleep 60  # Cool-down period

###############################################################################
# Phase 2: Stress Testing (4 hours)
###############################################################################
echo -e "${BLUE}========================================================${NC}"
echo -e "${BLUE}  Phase 2: Stress Testing (4 hours)${NC}"
echo -e "${BLUE}========================================================${NC}"
echo ""

log "Starting Phase 2: Stress Testing"
collect_metrics "phase2-start"

k6 run \
  --out json="$RESULTS_DIR/phase2-results.json" \
  --duration 4h \
  --vus 100 \
  --tag phase=stress \
  test/scalability/user-simulation.js 2>&1 | tee "$RESULTS_DIR/phase2-output.log"

PHASE2_EXIT=$?
collect_metrics "phase2-end"

if [ $PHASE2_EXIT -eq 0 ]; then
  log "✓ Phase 2 completed successfully"
  echo -e "${GREEN}✓ Phase 2: PASS${NC}"
else
  log "✗ Phase 2 failed with exit code $PHASE2_EXIT"
  echo -e "${RED}✗ Phase 2: FAIL${NC}"
  echo "Check logs in: $RESULTS_DIR/phase2-output.log"
  exit 1
fi

echo ""
sleep 60  # Cool-down period

###############################################################################
# Phase 3: Failure Scenarios (4 hours)
###############################################################################
echo -e "${BLUE}========================================================${NC}"
echo -e "${BLUE}  Phase 3: Failure Scenarios (4 hours)${NC}"
echo -e "${BLUE}========================================================${NC}"
echo ""

log "Starting Phase 3: Failure Scenarios"
collect_metrics "phase3-start"

# Start k6 load test in background
k6 run \
  --out json="$RESULTS_DIR/phase3-results.json" \
  --duration 4h \
  --vus 50 \
  --tag phase=failure \
  test/scalability/user-simulation.js > "$RESULTS_DIR/phase3-output.log" 2>&1 &
K6_PID=$!

# Wait 30 minutes for steady state
log "Waiting for steady state (30 minutes)..."
sleep 1800

# Apply chaos scenarios
log "Applying chaos scenarios..."

log "→ Network partition (5 minutes)"
kubectl apply -f test/chaos/network-partition.yaml
sleep 300
kubectl delete networkchaos --all -n "$NAMESPACE"
sleep 300

log "→ Pod failures (10 minutes)"
kubectl apply -f test/chaos/pod-failure.yaml
sleep 600
kubectl delete podchaos --all -n "$NAMESPACE"
sleep 300

log "→ Resource stress (15 minutes)"
kubectl apply -f test/chaos/resource-stress.yaml
sleep 900
kubectl delete stresschaos,iochaos --all -n "$NAMESPACE"
sleep 300

log "Chaos scenarios completed. Waiting for k6 to finish..."
wait $K6_PID
PHASE3_EXIT=$?

collect_metrics "phase3-end"

if [ $PHASE3_EXIT -eq 0 ]; then
  log "✓ Phase 3 completed successfully"
  echo -e "${GREEN}✓ Phase 3: PASS${NC}"
else
  log "✗ Phase 3 failed with exit code $PHASE3_EXIT"
  echo -e "${RED}✗ Phase 3: FAIL${NC}"
  echo "Check logs in: $RESULTS_DIR/phase3-output.log"
  exit 1
fi

echo ""
sleep 60  # Cool-down period

###############################################################################
# Phase 4: Sustained Load (24 hours)
###############################################################################
echo -e "${BLUE}========================================================${NC}"
echo -e "${BLUE}  Phase 4: Sustained Load (24 hours)${NC}"
echo -e "${BLUE}========================================================${NC}"
echo ""
echo -e "${YELLOW}This phase will run for 24 hours.${NC}"
echo -e "${YELLOW}Monitor progress at: $RESULTS_DIR/phase4-output.log${NC}"
echo ""

log "Starting Phase 4: Sustained Load (24 hours)"
collect_metrics "phase4-start"

k6 run \
  --out json="$RESULTS_DIR/phase4-results.json" \
  --duration 24h \
  --vus 100 \
  --tag phase=sustained \
  test/scalability/user-simulation.js 2>&1 | tee "$RESULTS_DIR/phase4-output.log"

PHASE4_EXIT=$?
collect_metrics "phase4-end"

if [ $PHASE4_EXIT -eq 0 ]; then
  log "✓ Phase 4 completed successfully"
  echo -e "${GREEN}✓ Phase 4: PASS${NC}"
else
  log "✗ Phase 4 failed with exit code $PHASE4_EXIT"
  echo -e "${RED}✗ Phase 4: FAIL${NC}"
  echo "Check logs in: $RESULTS_DIR/phase4-output.log"
  exit 1
fi

###############################################################################
# Final Summary
###############################################################################
log "All phases completed!"
echo ""
echo -e "${GREEN}========================================================${NC}"
echo -e "${GREEN}  ALL TESTS PASSED!${NC}"
echo -e "${GREEN}========================================================${NC}"
echo ""
echo "Test Results:"
echo "  Phase 1 (Baseline): PASS"
echo "  Phase 2 (Stress): PASS"
echo "  Phase 3 (Failure): PASS"
echo "  Phase 4 (Sustained): PASS"
echo ""
echo "Results directory: $RESULTS_DIR"
echo ""
