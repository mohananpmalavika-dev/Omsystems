#!/bin/bash
# Render Deployment Script for Sentinel Analytics Engine
# Usage: ./scripts/deploy-render.sh

set -e

echo "🚀 KryptonVision Analytics Engine - Render Deployment"
echo "======================================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the analytics-engine directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Please run this script from the analytics-engine directory${NC}"
    exit 1
fi

echo "📋 Pre-deployment Checklist"
echo "----------------------------"
echo ""

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js 18+ required (found v$NODE_VERSION)${NC}"
    exit 1
else
    echo -e "${GREEN}✅ Node.js version: $(node -v)${NC}"
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
else
    echo -e "${GREEN}✅ npm version: $(npm -v)${NC}"
fi

# Check if TypeScript compiles
echo ""
echo "🔨 Testing TypeScript compilation..."
if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✅ TypeScript compilation successful${NC}"
else
    echo -e "${RED}❌ TypeScript compilation failed${NC}"
    echo "   Run 'npm run build' to see errors"
    exit 1
fi

# Check for required files
echo ""
echo "📁 Checking required files..."
REQUIRED_FILES=(
    "render.yaml"
    "package.json"
    "tsconfig.json"
    "src/app.ts"
    "src/analytics-pipeline.ts"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ $file${NC}"
    else
        echo -e "${RED}❌ Missing: $file${NC}"
        exit 1
    fi
done

# Check for analog camera AI detectors
echo ""
echo "🤖 Checking Analog Camera AI modules..."
ANALOG_AI_FILES=(
    "src/detectors/analog-video-quality-detector.ts"
    "src/detectors/camera-aging-detector.ts"
    "src/detectors/camera-type-classifier.ts"
    "src/detectors/dvr-channel-health-detector.ts"
    "src/routes/analog-camera-api.ts"
)

for file in "${ANALOG_AI_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ $file${NC}"
    else
        echo -e "${YELLOW}⚠️  Missing: $file (feature may not work)${NC}"
    fi
done

# Check Git status
echo ""
echo "📦 Checking Git status..."
if [ -d ".git" ] || [ -d "../.git" ]; then
    echo -e "${GREEN}✅ Git repository detected${NC}"
    
    # Check for uncommitted changes
    if git diff --quiet && git diff --cached --quiet 2>/dev/null; then
        echo -e "${GREEN}✅ No uncommitted changes${NC}"
    else
        echo -e "${YELLOW}⚠️  You have uncommitted changes${NC}"
        echo "   Consider committing before deploying"
    fi
    
    # Check current branch
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
    echo "   Current branch: ${YELLOW}$CURRENT_BRANCH${NC}"
else
    echo -e "${RED}❌ Not a Git repository${NC}"
    echo "   Initialize with: git init"
    exit 1
fi

# Environment variables check
echo ""
echo "🔐 Environment Variables (for Render Dashboard)"
echo "------------------------------------------------"
echo ""
echo "Copy these to Render Dashboard → Environment Variables:"
echo ""
echo -e "${YELLOW}# Required${NC}"
echo "NODE_ENV=production"
echo "PORT=3000"
echo "ANALYTICS_SOURCE_SHARED_KEY=[generate-secure-key]"
echo "CONTROL_PLANE_SHARED_KEY=[your-control-plane-key]"
echo ""
echo -e "${YELLOW}# Analog Camera AI (Optional but Recommended)${NC}"
echo "ENABLE_ANALOG_VIDEO_QUALITY=true"
echo "ENABLE_CAMERA_AGING_PREDICTION=true"
echo "ENABLE_CAMERA_TYPE_CLASSIFIER=true"
echo "ENABLE_DVR_CHANNEL_HEALTH=true"
echo ""
echo -e "${YELLOW}# Model Configuration${NC}"
echo "ANALYTICS_REQUIRE_MODELS=true"
echo "MODEL_CACHE_SIZE_MB=2048"
echo ""

# Generate secure keys
echo ""
echo "🔑 Generated Secure Keys (copy for Render):"
echo "-------------------------------------------"
ANALYTICS_KEY=$(openssl rand -hex 32 2>/dev/null || echo "generate-manually")
CONTROL_PLANE_KEY=$(openssl rand -hex 32 2>/dev/null || echo "generate-manually")
echo ""
echo "ANALYTICS_SOURCE_SHARED_KEY=$ANALYTICS_KEY"
echo "CONTROL_PLANE_SHARED_KEY=$CONTROL_PLANE_KEY"
echo ""

# Summary
echo ""
echo "✨ Pre-deployment checks complete!"
echo "=================================="
echo ""
echo "Next Steps:"
echo "1. Push code to GitHub:"
echo "   ${GREEN}git add .${NC}"
echo "   ${GREEN}git commit -m 'Add analog camera AI features'${NC}"
echo "   ${GREEN}git push origin main${NC}"
echo ""
echo "2. Deploy on Render:"
echo "   a. Go to https://dashboard.render.com"
echo "   b. Click 'New +' → 'Web Service'"
echo "   c. Connect your GitHub repository"
echo "   d. Select branch and configure:"
echo "      - Root Directory: ${YELLOW}analytics-engine${NC}"
echo "      - Build Command: ${YELLOW}npm install && ANALYTICS_MODEL_LICENSES_ACCEPTED=true npm run models:download -- yolov8n && npm run build${NC}"
echo "      - Start Command: ${YELLOW}npm start${NC}"
echo "   e. Add environment variables from above"
echo "   f. Click 'Create Web Service'"
echo ""
echo "3. Monitor deployment:"
echo "   - Watch logs in Render dashboard"
echo "   - Test health endpoint after deployment"
echo ""
echo "4. Test deployment:"
echo "   ${GREEN}curl https://your-app.onrender.com/health${NC}"
echo "   ${GREEN}curl https://your-app.onrender.com/v1/analog/dashboard${NC}"
echo ""
echo "📖 Full guide: See RENDER_DEPLOYMENT_GUIDE.md"
echo ""
echo -e "${GREEN}Ready to deploy! 🎉${NC}"
