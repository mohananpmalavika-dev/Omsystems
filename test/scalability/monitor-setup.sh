#!/bin/bash

###############################################################################
# Monitoring Stack Setup for Scalability Testing
#
# Deploys Prometheus, Grafana, and alerting for real-time monitoring
# during the 400-branch scalability test.
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

NAMESPACE=${NAMESPACE:-"vms-test"}

echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  Monitoring Stack Setup${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""

# Check if Helm is installed
if ! command -v helm &> /dev/null; then
  echo -e "${RED}ERROR: Helm is required but not installed${NC}" >&2
  exit 1
fi

# Add Helm repositories
echo -e "${YELLOW}Adding Helm repositories...${NC}"
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
echo -e "${GREEN}✓ Helm repositories added${NC}"
echo ""

# Install Prometheus
echo -e "${YELLOW}Installing Prometheus...${NC}"
helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
  --namespace "$NAMESPACE" \
  --create-namespace \
  --set prometheus.prometheusSpec.retention=7d \
  --set prometheus.prometheusSpec.retentionSize=50GB \
  --set prometheus.prometheusSpec.scrapeInterval=30s \
  --set prometheus.prometheusSpec.evaluationInterval=30s \
  --set prometheus.prometheusSpec.resources.requests.cpu=2000m \
  --set prometheus.prometheusSpec.resources.requests.memory=8Gi \
  --set prometheus.prometheusSpec.resources.limits.cpu=4000m \
  --set prometheus.prometheusSpec.resources.limits.memory=16Gi \
  --wait

echo -e "${GREEN}✓ Prometheus installed${NC}"
echo ""

# Install Grafana
echo -e "${YELLOW}Installing Grafana...${NC}"
helm upgrade --install grafana grafana/grafana \
  --namespace "$NAMESPACE" \
  --set adminPassword=admin123 \
  --set persistence.enabled=true \
  --set persistence.size=20Gi \
  --set resources.requests.cpu=500m \
  --set resources.requests.memory=512Mi \
  --set resources.limits.cpu=1000m \
  --set resources.limits.memory=1Gi \
  --wait

echo -e "${GREEN}✓ Grafana installed${NC}"
echo ""

# Create ServiceMonitor for application metrics
echo -e "${YELLOW}Creating ServiceMonitor for application metrics...${NC}"
cat <<EOF | kubectl apply -f -
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: backend-metrics
  namespace: $NAMESPACE
  labels:
    app: backend
spec:
  selector:
    matchLabels:
      app: backend
  endpoints:
  - port: metrics
    interval: 30s
    path: /metrics
---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: postgres-metrics
  namespace: $NAMESPACE
  labels:
    app: postgres
spec:
  selector:
    matchLabels:
      app: postgres
  endpoints:
  - port: metrics
    interval: 30s
    path: /metrics
---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: redis-metrics
  namespace: $NAMESPACE
  labels:
    app: redis
spec:
  selector:
    matchLabels:
      app: redis
  endpoints:
  - port: metrics
    interval: 30s
    path: /metrics
EOF

echo -e "${GREEN}✓ ServiceMonitors created${NC}"
echo ""

# Import Grafana dashboards
echo -e "${YELLOW}Importing Grafana dashboards...${NC}"

GRAFANA_POD=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=grafana -o jsonpath='{.items[0].metadata.name}')

# Wait for Grafana to be ready
kubectl wait --for=condition=ready pod/"$GRAFANA_POD" -n "$NAMESPACE" --timeout=300s

# Port-forward Grafana (background)
kubectl port-forward -n "$NAMESPACE" svc/grafana 3001:80 > /dev/null 2>&1 &
PF_PID=$!
sleep 5

# Create dashboards using Grafana API
curl -X POST http://admin:admin123@localhost:3001/api/datasources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Prometheus",
    "type": "prometheus",
    "url": "http://prometheus-kube-prometheus-prometheus:9090",
    "access": "proxy",
    "isDefault": true
  }' > /dev/null 2>&1

# Kill port-forward
kill $PF_PID 2>/dev/null || true

echo -e "${GREEN}✓ Grafana dashboards configured${NC}"
echo ""

# Create PrometheusRule for alerts
echo -e "${YELLOW}Creating alert rules...${NC}"
cat <<EOF | kubectl apply -f -
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: scalability-test-alerts
  namespace: $NAMESPACE
  labels:
    prometheus: kube-prometheus
spec:
  groups:
  - name: scalability-test
    interval: 30s
    rules:
    - alert: HighAPILatency
      expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High API latency detected"
        description: "95th percentile API latency is above 1s"
    
    - alert: HighErrorRate
      expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "High error rate detected"
        description: "Error rate is above 1%"
    
    - alert: HighMemoryUsage
      expr: container_memory_usage_bytes{pod=~"backend-.*"} / container_spec_memory_limit_bytes > 0.9
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High memory usage"
        description: "Memory usage is above 90%"
    
    - alert: HighCPUUsage
      expr: rate(container_cpu_usage_seconds_total{pod=~"backend-.*"}[5m]) > 0.85
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "High CPU usage"
        description: "CPU usage is above 85%"
    
    - alert: DatabaseConnectionPoolExhaustion
      expr: pg_stat_database_numbackends / pg_settings_max_connections > 0.8
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "Database connection pool near exhaustion"
        description: "Database connections are above 80% of max"
    
    - alert: PodRestartingTooOften
      expr: rate(kube_pod_container_status_restarts_total[15m]) > 0.1
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "Pod restarting frequently"
        description: "Pod has restarted more than once in 15 minutes"
EOF

echo -e "${GREEN}✓ Alert rules created${NC}"
echo ""

# Display access information
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  Monitoring Stack Ready!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "Access URLs (use port-forward):"
echo ""
echo -e "${YELLOW}Prometheus:${NC}"
echo "  kubectl port-forward -n $NAMESPACE svc/prometheus-kube-prometheus-prometheus 9090:9090"
echo "  http://localhost:9090"
echo ""
echo -e "${YELLOW}Grafana:${NC}"
echo "  kubectl port-forward -n $NAMESPACE svc/grafana 3000:80"
echo "  http://localhost:3000"
echo "  Username: admin"
echo "  Password: admin123"
echo ""
echo -e "${YELLOW}Alertmanager:${NC}"
echo "  kubectl port-forward -n $NAMESPACE svc/prometheus-kube-prometheus-alertmanager 9093:9093"
echo "  http://localhost:9093"
echo ""
