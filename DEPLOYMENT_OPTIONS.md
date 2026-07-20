# Deployment Options - Where to Publish

## Overview

This system has 4 main components with different deployment requirements:

| Component | Where to Deploy | Why |
|-----------|----------------|-----|
| **Dashboard** | Vercel, Netlify, Cloudflare | Static Next.js app |
| **Control Plane API** | AWS, GCP, Azure, DigitalOcean | Needs database, persistent connections |
| **Media Gateway** | AWS, GCP, Azure, DigitalOcean | Needs to reach MediaMTX |
| **Edge Agent** | Local PC at each branch | Must be on same network as cameras |

---

## ✅ Option 1: Vercel Dashboard + Cloud Backend (Recommended)

### Architecture

```
Internet Users
      ↓
[Vercel] Dashboard (Next.js)
      ↓
[AWS/GCP/Azure] Control Plane API + Database
      ↓
[AWS/GCP/Azure] Media Gateway + MediaMTX
      ↑
[Local Branch] Edge Agent → Cameras
```

### Step-by-Step Deployment

#### 1. Deploy Dashboard to Vercel

```bash
cd dashboard

# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# Add environment variables in Vercel dashboard:
# - CONTROL_PLANE_INTERNAL_URL
# - MEDIA_GATEWAY_INTERNAL_URL
# - DASHBOARD_DEMO_MODE=false
```

**Vercel Environment Variables:**
```
CONTROL_PLANE_INTERNAL_URL=https://api.yourcompany.com
MEDIA_GATEWAY_INTERNAL_URL=https://media.yourcompany.com
DASHBOARD_DEMO_MODE=false
```

#### 2. Deploy Backend to AWS (Example)

**Using AWS EC2 + RDS:**

```bash
# Launch EC2 instance (Ubuntu 22.04, t3.medium or larger)
# Install Docker
sudo apt update
sudo apt install -y docker.io docker-compose
sudo usermod -aG docker ubuntu

# Create RDS PostgreSQL instance
# Get connection string

# On EC2, clone repo and configure
git clone <your-repo>
cd Omsystems

# Create production .env
cat > .env << EOF
HOST=0.0.0.0
PORT=8080
DATABASE_URL=postgresql://user:pass@rds-endpoint:5432/sentinel?sslmode=require
MEDIA_GATEWAY_SHARED_KEY=$(openssl rand -base64 32)
ALLOWED_ORIGINS=https://your-dashboard.vercel.app
NODE_ENV=production
EOF

# Start services
docker-compose up -d api media-gateway mediamtx

# Configure security groups:
# - Allow 8080 (Control Plane) from internet
# - Allow 8090 (Media Gateway) from internet  
# - Allow 8888/8889 (MediaMTX) from internet
# - Allow 5432 (PostgreSQL) from EC2 only
```

**Using AWS ECS (Fargate):**
- More scalable but complex
- See `deploy/aws-ecs/` directory (to be created)

#### 3. Configure Edge Agents (Local)

Each branch runs edge agent on a local PC:

```bash
# On Windows PC at branch
cd edge-agent

# Create .env
cat > .env << EOF
CONTROL_PLANE_URL=https://api.yourcompany.com
BRANCH_ID=branch-xyz-001
EDGE_AGENT_NAME=Branch-XYZ-Agent
EDGE_AGENT_VERSION=0.1.0
DEV_USER_ID=user-branch-admin
CAMERA_USERNAME=admin
CAMERA_PASSWORD=camera_password
EOF

# Run as Windows service or Task Scheduler
node dist/src/index.js
```

**Pros:**
- ✅ Dashboard scales automatically (Vercel)
- ✅ Easy to deploy and update
- ✅ Global CDN for dashboard
- ✅ Cameras stay on local network (secure)

**Cons:**
- ⚠️ Requires PC/server at each branch
- ⚠️ More complex than all-local
- 💰 Cloud hosting costs

**Cost Estimate:**
- Vercel: Free tier (or $20/mo Pro)
- AWS EC2 t3.medium: ~$30/mo
- AWS RDS t3.micro: ~$15/mo
- **Total: ~$50/mo** (for basic setup)

---

## ✅ Option 2: All-Cloud with Simulated Cameras

**Perfect for:** Demo, testing, development

### Deploy Everything to One Platform

#### Railway (Easiest)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create new project
railway init

# Add PostgreSQL
railway add -d postgres

# Deploy
railway up

# Set environment variables in Railway dashboard
```

**Railway Environment Variables:**
```
DATABASE_URL=${{Postgres.DATABASE_URL}}
MEDIA_GATEWAY_SHARED_KEY=<generate-strong-key>
STREAM_SECRETS_JSON={}
NODE_ENV=production
```

#### Render.com

1. Create account at render.com
2. Create PostgreSQL database
3. Create 3 web services:
   - Control Plane (Dockerfile)
   - Media Gateway (media-gateway/Dockerfile)
   - Dashboard (dashboard/Dockerfile)
4. Create background worker:
   - MediaMTX (use bluenviron/mediamtx image)

#### Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Launch services
fly launch --dockerfile Dockerfile
fly launch --dockerfile media-gateway/Dockerfile
fly launch --dockerfile dashboard/Dockerfile

# Add PostgreSQL
fly postgres create

# Set secrets
fly secrets set MEDIA_GATEWAY_SHARED_KEY=$(openssl rand -base64 32)
```

**Limitations:**
- ❌ No real camera integration (no edge agent)
- ✅ Good for UI/UX testing
- ✅ Good for API development
- ✅ Can use demo mode

**Cost:**
- Railway: ~$20/mo
- Render: ~$25/mo
- Fly.io: ~$15/mo

---

## ✅ Option 3: Self-Hosted (All Local)

**Perfect for:** Single location, small office, home use

### Deploy Everything on One Server

```bash
# On your local server/PC (Windows/Linux)
cd c:\Omsystems

# Start everything
docker-compose up -d

# Access:
# - Dashboard: http://localhost:3000
# - API: http://localhost:8080
# - Cameras: Automatically discovered
```

**Pros:**
- ✅ Simplest setup
- ✅ No cloud costs
- ✅ All data stays local
- ✅ Works offline

**Cons:**
- ❌ No remote access (without VPN/port forwarding)
- ❌ Single point of failure
- ❌ You manage backups/updates

**Cost:** $0 (just electricity)

---

## ✅ Option 4: Kubernetes (Enterprise)

**Perfect for:** Large scale (100+ branches), high availability

### Deploy to K8s Cluster

```bash
# Create namespace
kubectl create namespace sentinel

# Apply manifests
kubectl apply -f deploy/k8s/

# Includes:
# - Control Plane (Deployment + Service)
# - Media Gateway (Deployment + Service)
# - Dashboard (Deployment + Service)
# - PostgreSQL (StatefulSet or external)
# - MediaMTX (Deployment)
# - Ingress (NGINX/Traefik)
```

**Cloud K8s Options:**
- AWS EKS
- Google GKE
- Azure AKS
- DigitalOcean Kubernetes

**Pros:**
- ✅ Auto-scaling
- ✅ High availability
- ✅ Easy updates (rolling deployments)
- ✅ Multi-region support

**Cons:**
- ⚠️ Complex setup
- 💰 Higher costs
- 🎓 Requires K8s expertise

**Cost:** $200-500/mo (depending on scale)

---

## 🎯 Recommended Approaches by Use Case

### Home/Small Office (2-10 cameras)
**→ Option 3: Self-Hosted**
- Docker Compose on local PC
- $0/month
- 30 minutes setup

### Single Branch Business (10-50 cameras)
**→ Option 1 or 3:**
- Start with self-hosted
- Upgrade to cloud when needed
- $0-50/month

### Multi-Branch Business (50-500 cameras)
**→ Option 1: Hybrid**
- Vercel + AWS/GCP
- Edge agents at each branch
- $50-200/month

### Enterprise (500+ cameras)
**→ Option 4: Kubernetes**
- Multi-region deployment
- High availability
- $500+/month

---

## 📋 Deployment Checklist

### Before Deploying

- [ ] Complete critical security fixes (see CRITICAL_FIXES_CHECKLIST.md)
- [ ] Generate strong secrets
- [ ] Set up database backups
- [ ] Configure monitoring
- [ ] Test with real cameras
- [ ] Document edge agent setup per branch

### Vercel Dashboard Deployment

```bash
cd dashboard

# Build locally to test
npm run build

# Deploy to Vercel
vercel --prod

# Configure custom domain (optional)
vercel domains add dashboard.yourcompany.com
```

**Vercel Configuration (vercel.json):**
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "env": {
    "CONTROL_PLANE_INTERNAL_URL": "https://api.yourcompany.com",
    "MEDIA_GATEWAY_INTERNAL_URL": "https://media.yourcompany.com"
  }
}
```

### AWS Backend Deployment

**Quick Deploy (EC2 + Docker Compose):**

```bash
# Create EC2 instance
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.medium \
  --key-name your-key \
  --security-group-ids sg-xxx

# SSH into instance
ssh -i your-key.pem ubuntu@<ec2-ip>

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Clone and deploy
git clone <your-repo>
cd Omsystems
# Configure .env
docker-compose up -d
```

**Production Deploy (ECS Fargate):**

Create `deploy/aws/cloudformation.yaml`:
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  ControlPlaneCluster:
    Type: AWS::ECS::Cluster
  # ... more resources
```

### GCP Backend Deployment

```bash
# Using Cloud Run (serverless)
gcloud run deploy sentinel-api \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated

gcloud run deploy sentinel-media \
  --source ./media-gateway \
  --platform managed \
  --region us-central1
```

### Azure Backend Deployment

```bash
# Using Azure Container Instances
az container create \
  --resource-group sentinel-rg \
  --name sentinel-api \
  --image <your-registry>/sentinel-api:latest \
  --cpu 1 --memory 1 \
  --ports 8080
```

---

## 🔒 Production Configuration

### SSL/TLS Certificates

**For Cloud Deployments:**
- Use Let's Encrypt (free)
- Or cloud provider's managed certificates

**Setup with Caddy (automatic HTTPS):**
```bash
# Caddyfile
api.yourcompany.com {
    reverse_proxy localhost:8080
}

media.yourcompany.com {
    reverse_proxy localhost:8090
}
```

### Database Configuration

**Managed Database Services:**
- AWS RDS PostgreSQL
- Google Cloud SQL
- Azure Database for PostgreSQL
- DigitalOcean Managed Database

**Connection String:**
```
postgresql://user:pass@host:5432/sentinel?sslmode=require&pool_max=20
```

### Environment Variables

**Production .env Template:**
```bash
# API
HOST=0.0.0.0
PORT=8080
NODE_ENV=production
LOG_LEVEL=info

# Database (use managed service)
DATABASE_URL=postgresql://...?sslmode=require

# Secrets (generate with openssl rand -base64 32)
MEDIA_GATEWAY_SHARED_KEY=<strong-key-here>

# Security
ALLOWED_ORIGINS=https://dashboard.yourcompany.com
AUTH_MODE=oidc  # When OIDC is implemented

# Media Gateway
CONTROL_PLANE_URL=https://api.yourcompany.com
PUBLIC_HLS_BASE_URL=https://media.yourcompany.com
PUBLIC_WEBRTC_BASE_URL=https://media.yourcompany.com
```

---

## 📊 Cost Comparison

| Option | Setup Time | Monthly Cost | Best For |
|--------|-----------|--------------|----------|
| Self-Hosted | 1 hour | $0 | 1 location |
| Railway/Render | 30 min | $20-30 | Demo/testing |
| Vercel + AWS | 4 hours | $50-100 | 2-10 branches |
| Kubernetes | 2 days | $200-500 | 10+ branches |

---

## 🚀 Quick Start Commands

### Deploy Dashboard to Vercel
```bash
cd dashboard
npm install -g vercel
vercel login
vercel
```

### Deploy Backend to Railway
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### Self-Host Everything
```bash
docker-compose up -d
```

---

## 🆘 Need Help?

1. **Vercel Issues:** Check Vercel logs, verify environment variables
2. **Cloud Issues:** Check security groups, firewall rules
3. **Edge Agent:** Must be on same network as cameras
4. **MediaMTX:** Check if ports 8888/8889 are accessible

---

## Next Steps

1. Choose deployment option based on your use case
2. Follow security checklist (CRITICAL_FIXES_CHECKLIST.md)
3. Deploy to staging environment first
4. Test with real cameras
5. Monitor for 48 hours before production
6. Set up backups and disaster recovery

Good luck! 🚀
