#!/bin/bash

# ============================================================================
# Deploy Helmet False Alarm Fix to GCP Kubernetes
# ============================================================================
# This script deploys the updated ConfigMap with multi-model verification
# to eliminate helmet false alarms in the live GCP environment
# ============================================================================

set -e  # Exit on error

echo "=================================================================="
echo " Helmet False Alarm Fix - GCP Deployment"
echo "=================================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="sentinel-analytics"
CONFIGMAP_NAME="analytics-engine-config"
DEPLOYMENT_NAME="analytics-engine"

# ============================================================================
# Step 1: Verify kubectl access
# ============================================================================
echo -e "${YELLOW}Step 1: Verifying kubectl access...${NC}"

if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}❌ kubectl not found. Please install kubectl first.${NC}"
    exit 1
fi

if ! kubectl cluster-info &> /dev/null; then
    echo -e "${RED}❌ Cannot connect to Kubernetes cluster. Please configure kubectl.${NC}"
    exit 1
fi

CURRENT_CONTEXT=$(kubectl config current-context)
echo -e "${GREEN}✓ Connected to cluster: $CURRENT_CONTEXT${NC}"
echo ""

# ============================================================================
# Step 2: Verify namespace exists
# ============================================================================
echo -e "${YELLOW}Step 2: Verifying namespace...${NC}"

if ! kubectl get namespace $NAMESPACE &> /dev/null; then
    echo -e "${RED}❌ Namespace $NAMESPACE not found.${NC}"
    echo "Creating namespace..."
    kubectl create namespace $NAMESPACE
fi

echo -e "${GREEN}✓ Namespace $NAMESPACE exists${NC}"
echo ""

# ============================================================================
# Step 3: Backup current ConfigMap
# ============================================================================
echo -e "${YELLOW}Step 3: Backing up current ConfigMap...${NC}"

BACKUP_FILE="configmap-backup-$(date +%Y%m%d-%H%M%S).yaml"

if kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE &> /dev/null; then
    kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o yaml > "k8s/$BACKUP_FILE"
    echo -e "${GREEN}✓ Current ConfigMap backed up to: k8s/$BACKUP_FILE${NC}"
else
    echo -e "${YELLOW}⚠ No existing ConfigMap found (this may be first deployment)${NC}"
fi
echo ""

# ============================================================================
# Step 4: Apply updated ConfigMap
# ============================================================================
echo -e "${YELLOW}Step 4: Applying updated ConfigMap with helmet fix...${NC}"

kubectl apply -f k8s/configmap-helmet-fix.yaml

echo -e "${GREEN}✓ ConfigMap updated successfully${NC}"
echo ""

# ============================================================================
# Step 5: Verify ConfigMap settings
# ============================================================================
echo -e "${YELLOW}Step 5: Verifying helmet fix settings in ConfigMap...${NC}"

HELMET_MULTI_MODEL=$(kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o jsonpath='{.data.HELMET_MULTI_MODEL}')
ENABLE_POSE=$(kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o jsonpath='{.data.ENABLE_POSE_ESTIMATION}')
ENABLE_FACE=$(kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o jsonpath='{.data.ENABLE_FACE_RECOGNITION}')

if [ "$HELMET_MULTI_MODEL" == "true" ] && [ "$ENABLE_POSE" == "true" ] && [ "$ENABLE_FACE" == "true" ]; then
    echo -e "${GREEN}✓ HELMET_MULTI_MODEL: $HELMET_MULTI_MODEL${NC}"
    echo -e "${GREEN}✓ ENABLE_POSE_ESTIMATION: $ENABLE_POSE${NC}"
    echo -e "${GREEN}✓ ENABLE_FACE_RECOGNITION: $ENABLE_FACE${NC}"
else
    echo -e "${RED}❌ ConfigMap validation failed:${NC}"
    echo "  HELMET_MULTI_MODEL: $HELMET_MULTI_MODEL (expected: true)"
    echo "  ENABLE_POSE_ESTIMATION: $ENABLE_POSE (expected: true)"
    echo "  ENABLE_FACE_RECOGNITION: $ENABLE_FACE (expected: true)"
    exit 1
fi
echo ""

# ============================================================================
# Step 6: Restart analytics engine pods
# ============================================================================
echo -e "${YELLOW}Step 6: Restarting analytics engine pods...${NC}"

echo "This will trigger a rolling restart of all analytics engine pods."
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

kubectl rollout restart deployment/$DEPLOYMENT_NAME -n $NAMESPACE

echo -e "${GREEN}✓ Rollout initiated${NC}"
echo ""

# ============================================================================
# Step 7: Monitor rollout status
# ============================================================================
echo -e "${YELLOW}Step 7: Monitoring rollout status...${NC}"
echo "This may take 2-3 minutes..."
echo ""

kubectl rollout status deployment/$DEPLOYMENT_NAME -n $NAMESPACE --timeout=5m

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Rollout completed successfully${NC}"
else
    echo -e "${RED}❌ Rollout failed or timed out${NC}"
    echo "Check pod logs: kubectl logs -f deployment/$DEPLOYMENT_NAME -n $NAMESPACE"
    exit 1
fi
echo ""

# ============================================================================
# Step 8: Verify pods are healthy
# ============================================================================
echo -e "${YELLOW}Step 8: Verifying pod health...${NC}"

sleep 10  # Give pods time to start up

READY_PODS=$(kubectl get pods -n $NAMESPACE -l app=analytics-engine --field-selector=status.phase=Running | grep -c "Running" || echo "0")
TOTAL_PODS=$(kubectl get deployment $DEPLOYMENT_NAME -n $NAMESPACE -o jsonpath='{.spec.replicas}')

echo "Ready pods: $READY_PODS / $TOTAL_PODS"

if [ "$READY_PODS" -eq "$TOTAL_PODS" ]; then
    echo -e "${GREEN}✓ All pods are healthy${NC}"
else
    echo -e "${YELLOW}⚠ Only $READY_PODS of $TOTAL_PODS pods are ready. Checking pod status...${NC}"
    kubectl get pods -n $NAMESPACE -l app=analytics-engine
fi
echo ""

# ============================================================================
# Step 9: Verify multi-model verification in logs
# ============================================================================
echo -e "${YELLOW}Step 9: Checking logs for multi-model verification...${NC}"

echo "Waiting for pod to initialize (30 seconds)..."
sleep 30

POD_NAME=$(kubectl get pods -n $NAMESPACE -l app=analytics-engine --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}')

if [ -z "$POD_NAME" ]; then
    echo -e "${RED}❌ No running pod found${NC}"
    exit 1
fi

echo "Checking logs from pod: $POD_NAME"
echo ""

LOGS=$(kubectl logs $POD_NAME -n $NAMESPACE --tail=100 | grep -i "helmet" || echo "")

if echo "$LOGS" | grep -q "multi-model verification"; then
    echo -e "${GREEN}✓ Multi-model verification confirmed in logs:${NC}"
    echo "$LOGS" | grep "multi-model"
else
    echo -e "${YELLOW}⚠ Multi-model verification message not found in logs yet.${NC}"
    echo "This may take a few more seconds. Check logs manually:"
    echo "  kubectl logs -f $POD_NAME -n $NAMESPACE | grep -i helmet"
fi
echo ""

# ============================================================================
# Step 10: Health check
# ============================================================================
echo -e "${YELLOW}Step 10: Running health check...${NC}"

echo "Port-forwarding to pod for health check..."
kubectl port-forward $POD_NAME -n $NAMESPACE 8092:8092 &
PF_PID=$!
sleep 5

HEALTH_RESPONSE=$(curl -s http://localhost:8092/health || echo "ERROR")

kill $PF_PID 2>/dev/null || true

if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
    echo -e "${GREEN}✓ Health check passed${NC}"
    echo "$HEALTH_RESPONSE" | jq '.' 2>/dev/null || echo "$HEALTH_RESPONSE"
else
    echo -e "${YELLOW}⚠ Health check did not return expected response${NC}"
    echo "$HEALTH_RESPONSE"
fi
echo ""

# ============================================================================
# Deployment Summary
# ============================================================================
echo "=================================================================="
echo -e "${GREEN} Deployment Complete${NC}"
echo "=================================================================="
echo ""
echo "Configuration applied:"
echo "  ✓ HELMET_MULTI_MODEL=true"
echo "  ✓ ENABLE_POSE_ESTIMATION=true"
echo "  ✓ ENABLE_FACE_RECOGNITION=true"
echo ""
echo "Expected results (monitor for 24-48 hours):"
echo "  • Detection time: 4-6 seconds"
echo "  • False alarm rate: <2% (down from 15-40%)"
echo "  • Bare heads, chairs, dark objects: REJECTED"
echo "  • Evidence source: 'localized-head-classification'"
echo ""
echo "Monitoring commands:"
echo "  # Watch logs for helmet detections"
echo "  kubectl logs -f deployment/$DEPLOYMENT_NAME -n $NAMESPACE | grep helmet"
echo ""
echo "  # Check pod status"
echo "  kubectl get pods -n $NAMESPACE -l app=analytics-engine"
echo ""
echo "  # View recent logs"
echo "  kubectl logs deployment/$DEPLOYMENT_NAME -n $NAMESPACE --tail=100"
echo ""
echo "  # Port forward to access health endpoint"
echo "  kubectl port-forward deployment/$DEPLOYMENT_NAME -n $NAMESPACE 8092:8092"
echo ""
echo "Rollback command (if needed):"
echo "  kubectl apply -f k8s/$BACKUP_FILE"
echo "  kubectl rollout restart deployment/$DEPLOYMENT_NAME -n $NAMESPACE"
echo ""
echo "=================================================================="

