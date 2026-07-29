#!/bin/bash

###############################################################################
# Continuous Health Check Script for 400-Branch Scalability Test
#
# Runs every 5 minutes during the 24-hour sustained load test.
# Checks:
# - API availability
# - Database connectivity
# - Redis connectivity
# - Kubernetes pod health
# - Disk space
# - Memory usage
# - Error rates
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
API_URL=${API_URL:-"http://localhost:3000"}
DATABASE_URL=${DATABASE_URL:-"postgresql://postgres:postgres@localhost:5432/vms_test"}
REDIS_HOST=${REDIS_HOST:-"localhost"}
REDIS_PORT=${REDIS_PORT:-6379}
NAMESPACE=${NAMESPACE:-"vms-test"}
LOG_FILE=${LOG_FILE:-"./test-results/health-check.log"}

# Timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Initialize log file
mkdir -p "$(dirname "$LOG_FILE")"
echo "[$TIMESTAMP] Starting health check..." | tee -a "$LOG_FILE"

FAILURE_COUNT=0

###############################################################################
# 1. Check API Availability
###############################################################################
echo -e "${YELLOW}Checking API health...${NC}"

API_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" || echo "000")

if [ "$API_RESPONSE" = "200" ]; then
  echo -e "${GREEN}✓ API is healthy (HTTP $API_RESPONSE)${NC}"
  echo "[$TIMESTAMP] API: HEALTHY" >> "$LOG_FILE"
else
  echo -e "${RED}✗ API is unhealthy (HTTP $API_RESPONSE)${NC}"
  echo "[$TIMESTAMP] API: FAILED (HTTP $API_RESPONSE)" >> "$LOG_FILE"
  ((FAILURE_COUNT++))
fi

# Check API response time
API_TIME=$(curl -s -o /dev/null -w "%{time_total}" "$API_URL/health" || echo "0")
echo "  Response time: ${API_TIME}s"
echo "[$TIMESTAMP] API response time: ${API_TIME}s" >> "$LOG_FILE"

if (( $(echo "$API_TIME > 2.0" | bc -l) )); then
  echo -e "${YELLOW}⚠ API response time is slow (> 2s)${NC}"
  echo "[$TIMESTAMP] API: SLOW RESPONSE" >> "$LOG_FILE"
fi

###############################################################################
# 2. Check Database Connectivity
###############################################################################
echo -e "${YELLOW}Checking database health...${NC}"

DB_RESULT=$(psql "$DATABASE_URL" -t -c "SELECT 1;" 2>&1 || echo "FAILED")

if [ "$DB_RESULT" = " 1" ]; then
  echo -e "${GREEN}✓ Database is healthy${NC}"
  echo "[$TIMESTAMP] Database: HEALTHY" >> "$LOG_FILE"
  
  # Check connection count
  DB_CONNECTIONS=$(psql "$DATABASE_URL" -t -c "SELECT count(*) FROM pg_stat_activity;" | tr -d ' ')
  echo "  Active connections: $DB_CONNECTIONS"
  echo "[$TIMESTAMP] Database connections: $DB_CONNECTIONS" >> "$LOG_FILE"
  
  if [ "$DB_CONNECTIONS" -gt 400 ]; then
    echo -e "${YELLOW}⚠ High database connection count (> 400)${NC}"
    echo "[$TIMESTAMP] Database: HIGH CONNECTION COUNT" >> "$LOG_FILE"
  fi
  
  # Check for long-running queries
  LONG_QUERIES=$(psql "$DATABASE_URL" -t -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND NOW() - query_start > interval '30 seconds';" | tr -d ' ')
  if [ "$LONG_QUERIES" -gt 0 ]; then
    echo -e "${YELLOW}⚠ $LONG_QUERIES long-running queries detected${NC}"
    echo "[$TIMESTAMP] Database: $LONG_QUERIES long-running queries" >> "$LOG_FILE"
  fi
else
  echo -e "${RED}✗ Database is unhealthy${NC}"
  echo "[$TIMESTAMP] Database: FAILED" >> "$LOG_FILE"
  ((FAILURE_COUNT++))
fi

###############################################################################
# 3. Check Redis Connectivity
###############################################################################
echo -e "${YELLOW}Checking Redis health...${NC}"

REDIS_RESULT=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>&1 || echo "FAILED")

if [ "$REDIS_RESULT" = "PONG" ]; then
  echo -e "${GREEN}✓ Redis is healthy${NC}"
  echo "[$TIMESTAMP] Redis: HEALTHY" >> "$LOG_FILE"
  
  # Check memory usage
  REDIS_MEMORY=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
  echo "  Memory usage: $REDIS_MEMORY"
  echo "[$TIMESTAMP] Redis memory: $REDIS_MEMORY" >> "$LOG_FILE"
else
  echo -e "${RED}✗ Redis is unhealthy${NC}"
  echo "[$TIMESTAMP] Redis: FAILED" >> "$LOG_FILE"
  ((FAILURE_COUNT++))
fi

###############################################################################
# 4. Check Kubernetes Pods
###############################################################################
if command -v kubectl &> /dev/null; then
  echo -e "${YELLOW}Checking Kubernetes pods...${NC}"
  
  TOTAL_PODS=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l || echo "0")
  RUNNING_PODS=$(kubectl get pods -n "$NAMESPACE" --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l || echo "0")
  FAILED_PODS=$(kubectl get pods -n "$NAMESPACE" --field-selector=status.phase=Failed --no-headers 2>/dev/null | wc -l || echo "0")
  PENDING_PODS=$(kubectl get pods -n "$NAMESPACE" --field-selector=status.phase=Pending --no-headers 2>/dev/null | wc -l || echo "0")
  
  echo "  Total pods: $TOTAL_PODS"
  echo "  Running: $RUNNING_PODS"
  echo "  Failed: $FAILED_PODS"
  echo "  Pending: $PENDING_PODS"
  
  echo "[$TIMESTAMP] K8s pods: Total=$TOTAL_PODS Running=$RUNNING_PODS Failed=$FAILED_PODS Pending=$PENDING_PODS" >> "$LOG_FILE"
  
  if [ "$FAILED_PODS" -gt 0 ]; then
    echo -e "${RED}✗ $FAILED_PODS failed pods detected${NC}"
    kubectl get pods -n "$NAMESPACE" --field-selector=status.phase=Failed --no-headers
    ((FAILURE_COUNT++))
  elif [ "$PENDING_PODS" -gt 5 ]; then
    echo -e "${YELLOW}⚠ $PENDING_PODS pending pods (possible resource constraints)${NC}"
  elif [ "$RUNNING_PODS" -eq "$TOTAL_PODS" ]; then
    echo -e "${GREEN}✓ All pods are running${NC}"
  fi
  
  # Check pod restarts
  HIGH_RESTART_PODS=$(kubectl get pods -n "$NAMESPACE" -o json 2>/dev/null | jq -r '.items[] | select(.status.containerStatuses[].restartCount > 5) | .metadata.name' || echo "")
  if [ -n "$HIGH_RESTART_PODS" ]; then
    echo -e "${YELLOW}⚠ Pods with high restart counts:${NC}"
    echo "$HIGH_RESTART_PODS"
    echo "[$TIMESTAMP] K8s: High restart pods: $HIGH_RESTART_PODS" >> "$LOG_FILE"
  fi
else
  echo -e "${YELLOW}⚠ kubectl not available, skipping Kubernetes checks${NC}"
fi

###############################################################################
# 5. Check Disk Space
###############################################################################
echo -e "${YELLOW}Checking disk space...${NC}"

DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
echo "  Root disk usage: ${DISK_USAGE}%"
echo "[$TIMESTAMP] Disk usage: ${DISK_USAGE}%" >> "$LOG_FILE"

if [ "$DISK_USAGE" -gt 90 ]; then
  echo -e "${RED}✗ Critical disk space (> 90%)${NC}"
  echo "[$TIMESTAMP] Disk: CRITICAL (${DISK_USAGE}%)" >> "$LOG_FILE"
  ((FAILURE_COUNT++))
elif [ "$DISK_USAGE" -gt 80 ]; then
  echo -e "${YELLOW}⚠ High disk usage (> 80%)${NC}"
  echo "[$TIMESTAMP] Disk: HIGH USAGE (${DISK_USAGE}%)" >> "$LOG_FILE"
else
  echo -e "${GREEN}✓ Disk space is healthy${NC}"
fi

###############################################################################
# 6. Check Memory Usage
###############################################################################
echo -e "${YELLOW}Checking memory usage...${NC}"

if [ -f /proc/meminfo ]; then
  TOTAL_MEM=$(grep MemTotal /proc/meminfo | awk '{print $2}')
  AVAIL_MEM=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
  USED_MEM=$((TOTAL_MEM - AVAIL_MEM))
  MEM_USAGE=$((USED_MEM * 100 / TOTAL_MEM))
  
  echo "  Memory usage: ${MEM_USAGE}%"
  echo "[$TIMESTAMP] Memory usage: ${MEM_USAGE}%" >> "$LOG_FILE"
  
  if [ "$MEM_USAGE" -gt 90 ]; then
    echo -e "${RED}✗ Critical memory usage (> 90%)${NC}"
    echo "[$TIMESTAMP] Memory: CRITICAL (${MEM_USAGE}%)" >> "$LOG_FILE"
    ((FAILURE_COUNT++))
  elif [ "$MEM_USAGE" -gt 80 ]; then
    echo -e "${YELLOW}⚠ High memory usage (> 80%)${NC}"
    echo "[$TIMESTAMP] Memory: HIGH USAGE (${MEM_USAGE}%)" >> "$LOG_FILE"
  else
    echo -e "${GREEN}✓ Memory usage is healthy${NC}"
  fi
else
  echo -e "${YELLOW}⚠ Cannot read /proc/meminfo${NC}"
fi

###############################################################################
# 7. Check Application Error Rates
###############################################################################
echo -e "${YELLOW}Checking application error rates...${NC}"

# Query last 5 minutes of errors from API
ERROR_RESPONSE=$(curl -s "$API_URL/api/system/metrics/errors?window=5m" || echo "{}")
ERROR_COUNT=$(echo "$ERROR_RESPONSE" | jq -r '.count // 0' 2>/dev/null || echo "0")
ERROR_RATE=$(echo "$ERROR_RESPONSE" | jq -r '.rate // 0' 2>/dev/null || echo "0")

echo "  Errors in last 5min: $ERROR_COUNT"
echo "  Error rate: ${ERROR_RATE}%"
echo "[$TIMESTAMP] Errors: count=$ERROR_COUNT rate=${ERROR_RATE}%" >> "$LOG_FILE"

if (( $(echo "$ERROR_RATE > 1.0" | bc -l) )); then
  echo -e "${RED}✗ High error rate (> 1%)${NC}"
  echo "[$TIMESTAMP] Errors: HIGH RATE (${ERROR_RATE}%)" >> "$LOG_FILE"
  ((FAILURE_COUNT++))
elif (( $(echo "$ERROR_RATE > 0.1" | bc -l) )); then
  echo -e "${YELLOW}⚠ Elevated error rate (> 0.1%)${NC}"
  echo "[$TIMESTAMP] Errors: ELEVATED (${ERROR_RATE}%)" >> "$LOG_FILE"
else
  echo -e "${GREEN}✓ Error rate is healthy${NC}"
fi

###############################################################################
# Summary
###############################################################################
echo ""
echo "============================================"

if [ "$FAILURE_COUNT" -eq 0 ]; then
  echo -e "${GREEN}✓ All health checks passed${NC}"
  echo "[$TIMESTAMP] OVERALL: PASS" >> "$LOG_FILE"
  exit 0
else
  echo -e "${RED}✗ $FAILURE_COUNT health check(s) failed${NC}"
  echo "[$TIMESTAMP] OVERALL: FAIL ($FAILURE_COUNT failures)" >> "$LOG_FILE"
  exit 1
fi
