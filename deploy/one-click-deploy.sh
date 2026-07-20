#!/bin/bash
set -e

echo "🚀 Sentinel Grid - One-Click Deployment"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js 22+${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js found: $(node --version)${NC}"

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm not found${NC}"
    exit 1
fi
echo -e "${GREEN}✅ npm found: $(npm --version)${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}⚠️  Docker not found (optional for local testing)${NC}"
else
    echo -e "${GREEN}✅ Docker found: $(docker --version)${NC}"
fi

echo ""
echo "🎯 Choose deployment target:"
echo "1) Vercel (Dashboard only)"
echo "2) Railway (Full backend)"
echo "3) Self-hosted (Docker Compose)"
echo "4) All of the above"
echo ""
read -p "Enter choice [1-4]: " choice

case $choice in
    1)
        echo ""
        echo "📦 Deploying Dashboard to Vercel..."
        
        # Install Vercel CLI if not present
        if ! command -v vercel &> /dev/null; then
            echo "Installing Vercel CLI..."
            npm install -g vercel
        fi
        
        # Deploy
        cd dashboard
        echo ""
        echo "🔑 You'll need to set these environment variables in Vercel:"
        echo "  CONTROL_PLANE_INTERNAL_URL=https://your-api-url.railway.app"
        echo "  MEDIA_GATEWAY_INTERNAL_URL=https://your-media-url.railway.app"
        echo ""
        read -p "Press Enter to continue with Vercel deployment..."
        
        vercel --prod
        
        echo -e "${GREEN}✅ Dashboard deployed to Vercel!${NC}"
        ;;
        
    2)
        echo ""
        echo "📦 Deploying Backend to Railway..."
        
        # Install Railway CLI if not present
        if ! command -v railway &> /dev/null; then
            echo "Installing Railway CLI..."
            npm install -g @railway/cli
        fi
        
        echo ""
        echo "🔑 Logging into Railway..."
        railway login
        
        echo ""
        echo "Creating new Railway project..."
        railway init
        
        echo ""
        echo "📊 Adding PostgreSQL database..."
        railway add -d postgres
        
        echo ""
        echo "🚀 Deploying Control Plane..."
        railway up
        
        echo ""
        echo "🔑 Setting environment variables..."
        SHARED_KEY=$(openssl rand -base64 32)
        railway variables set MEDIA_GATEWAY_SHARED_KEY="$SHARED_KEY"
        railway variables set NODE_ENV="production"
        railway variables set LOG_LEVEL="info"
        railway variables set ALLOWED_ORIGINS="https://your-dashboard.vercel.app"
        
        echo -e "${GREEN}✅ Backend deployed to Railway!${NC}"
        echo ""
        echo "📝 Next steps:"
        echo "1. Get your Railway URL from: railway open"
        echo "2. Deploy Media Gateway (repeat for media-gateway folder)"
        echo "3. Update Vercel environment variables with Railway URLs"
        ;;
        
    3)
        echo ""
        echo "🐳 Starting local Docker Compose deployment..."
        
        if ! command -v docker-compose &> /dev/null; then
            echo -e "${RED}❌ docker-compose not found. Please install Docker Desktop${NC}"
            exit 1
        fi
        
        # Generate secrets
        echo "🔑 Generating secure secrets..."
        MEDIA_KEY=$(openssl rand -base64 32)
        DB_PASS=$(openssl rand -base64 24 | tr -d '/+=')
        
        # Create .env file
        cat > .env << EOF
# Generated on $(date)
HOST=0.0.0.0
PORT=8080
LOG_LEVEL=info
NODE_ENV=production

# Database
DATABASE_URL=postgresql://sentinel:${DB_PASS}@postgres:5432/sentinel
POSTGRES_DB=sentinel
POSTGRES_USER=sentinel
POSTGRES_PASSWORD=${DB_PASS}

# Security
MEDIA_GATEWAY_SHARED_KEY=${MEDIA_KEY}
ALLOWED_ORIGINS=http://localhost:3000

# Media Gateway
CONTROL_PLANE_URL=http://api:8080
MEDIAMTX_API_URL=http://mediamtx:9997
PUBLIC_HLS_BASE_URL=http://localhost:8888
PUBLIC_WEBRTC_BASE_URL=http://localhost:8889
MEDIA_ACCESS_TTL_SECONDS=300
STREAM_SECRETS_JSON={}

# Dashboard
DASHBOARD_DEMO_MODE=false
CONTROL_PLANE_INTERNAL_URL=http://api:8080
MEDIA_GATEWAY_INTERNAL_URL=http://media-gateway:8090
DASHBOARD_DEV_USER_ID=user-global-admin
EOF
        
        echo -e "${GREEN}✅ .env file created${NC}"
        
        # Start services
        echo ""
        echo "🚀 Starting services..."
        docker-compose up -d
        
        echo ""
        echo "⏳ Waiting for services to be ready..."
        sleep 15
        
        # Check health
        if curl -f http://localhost:8080/health > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Control Plane is healthy${NC}"
        else
            echo -e "${YELLOW}⚠️  Control Plane not responding yet${NC}"
        fi
        
        if curl -f http://localhost:8090/health > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Media Gateway is healthy${NC}"
        else
            echo -e "${YELLOW}⚠️  Media Gateway not responding yet${NC}"
        fi
        
        echo ""
        echo -e "${GREEN}✅ Self-hosted deployment complete!${NC}"
        echo ""
        echo "🌐 Access your services:"
        echo "  Dashboard: http://localhost:3000"
        echo "  API: http://localhost:8080"
        echo "  Media Gateway: http://localhost:8090"
        echo ""
        echo "📊 View logs: docker-compose logs -f"
        echo "🛑 Stop services: docker-compose down"
        ;;
        
    4)
        echo ""
        echo "🚀 Full deployment coming soon..."
        echo "For now, run options 1, 2, and 3 separately"
        ;;
        
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo ""
echo "📚 Next steps:"
echo "1. Configure edge agents at each branch (see edge-agent/.env.example)"
echo "2. Set up monitoring and backups"
echo "3. Review security checklist: CRITICAL_FIXES_CHECKLIST.md"
echo ""
