# MIS Reporting System - Deployment & Training Guide

**Project:** MIS Reporting System - Phases 1-3  
**Date:** September 17, 2026  
**Version:** 1.0  
**Audience:** DevOps, IT Administrators, Users

---

## Table of Contents

1. [Deployment Guide](#deployment-guide)
2. [User Training Materials](#user-training-materials)
3. [Quick Start Guides](#quick-start-guides)
4. [Troubleshooting](#troubleshooting)
5. [Support Resources](#support-resources)

---

# Part 1: Deployment Guide

## Pre-Deployment Checklist

### System Requirements

**Server Requirements (Backend):**
- Node.js 18.x or higher
- PostgreSQL 14.x or higher
- Redis 6.x or higher (Phase 3)
- 8GB RAM minimum (16GB recommended)
- 4 CPU cores minimum
- 100GB disk space

**Client Requirements (Frontend):**
- Modern web browser (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- 1920x1080 resolution recommended (responsive down to 768px)
- JavaScript enabled
- Cookies enabled

**Network Requirements:**
- HTTPS/TLS 1.2+ (required for production)
- Ports: 3000 (backend), 3001 (frontend)
- WebSocket support for real-time updates
- Minimum 10 Mbps connection

---

## Deployment Steps

### Step 1: Database Setup

#### 1.1 Create MIS Database Schema

```sql
-- Connect to PostgreSQL
psql -U postgres

-- Create database if not exists
CREATE DATABASE surveillance;

-- Connect to database
\c surveillance

-- Verify existing tables
\dt

-- You should see tables: tenants, users, incidents, cameras, branches, etc.
```

#### 1.2 Run MIS Migrations

**Phase 1-2 Migration:**
```bash
# Navigate to project root
cd /path/to/Omsystems

# Run database migration
psql -U postgres -d surveillance -f migrations/003_mis_performance_indexes.sql

# Verify indexes created
psql -U postgres -d surveillance -c "\di"

# Expected output: 30+ indexes starting with idx_
```

**Phase 3 Migration (if applicable):**
```bash
# Run Phase 3 migrations in order
psql -U postgres -d surveillance -f migrations/004_rbac_schema.sql
psql -U postgres -d surveillance -f migrations/005_audit_logging.sql
psql -U postgres -d surveillance -f migrations/006_ai_analytics.sql
```

#### 1.3 Verify Database Health

```sql
-- Check table counts
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC
LIMIT 20;

-- Expected: New MIS indexes should appear with 0 scans (will increase with use)
```

---

### Step 2: Backend Deployment

#### 2.1 Install Dependencies

```bash
# Navigate to project root
cd /path/to/Omsystems

# Install Node.js dependencies
npm install

# Verify critical packages
npm list | grep -E "(express|pg|jsonwebtoken|cors)"
```

#### 2.2 Configure Environment

```bash
# Copy environment template
cp .env.example .env.production

# Edit production environment
nano .env.production
```

**Required Environment Variables:**
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/surveillance
DB_HOST=localhost
DB_PORT=5432
DB_NAME=surveillance
DB_USER=surveillance_user
DB_PASSWORD=<strong-password>

# Server
NODE_ENV=production
PORT=3000
API_BASE_URL=https://api.yourdomain.com

# Authentication
JWT_SECRET=<generate-strong-secret-key>
JWT_EXPIRES_IN=24h
SESSION_SECRET=<generate-strong-secret-key>

# CORS
ALLOWED_ORIGINS=https://dashboard.yourdomain.com,https://yourdomain.com

# Redis (Phase 3)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=<redis-password>

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/mis/application.log

# Email (for scheduled reports)
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_USER=reports@yourdomain.com
SMTP_PASSWORD=<smtp-password>
SMTP_FROM=MIS Reports <reports@yourdomain.com>
```

**Generate Secure Secrets:**
```bash
# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate session secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

#### 2.3 Build Backend

```bash
# TypeScript compilation
npm run build

# Verify build output
ls -la dist/

# Expected: dist/ folder with compiled JavaScript files
```

#### 2.4 Start Backend Service

**Option A: Direct Node (Development/Testing)**
```bash
# Start server
NODE_ENV=production node dist/server.js

# Verify server started
curl http://localhost:3000/health

# Expected: {"status":"ok","timestamp":"..."}
```

**Option B: PM2 (Recommended for Production)**
```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start dist/server.js --name surveillance-mis-backend --env production

# Configure auto-restart
pm2 startup
pm2 save

# Monitor logs
pm2 logs surveillance-mis-backend

# Check status
pm2 status
```

**Option C: Systemd Service (Linux)**
```bash
# Create systemd service file
sudo nano /etc/systemd/system/surveillance-mis.service
```

```ini
[Unit]
Description=Surveillance MIS Backend
After=network.target postgresql.service

[Service]
Type=simple
User=surveillance
WorkingDirectory=/opt/surveillance
ExecStart=/usr/bin/node /opt/surveillance/dist/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=surveillance-mis
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable surveillance-mis
sudo systemctl start surveillance-mis

# Check status
sudo systemctl status surveillance-mis

# View logs
sudo journalctl -u surveillance-mis -f
```

#### 2.5 Verify Backend APIs

**Test Script:**
```bash
#!/bin/bash
# test-mis-backend.sh

BASE_URL="http://localhost:3000"
TOKEN="<your-jwt-token>"  # Get from login

echo "Testing MIS Backend APIs..."

# Health check
echo "1. Health check..."
curl -s "$BASE_URL/health" | jq

# Login (get token)
echo "2. Login..."
TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}' \
  | jq -r '.token')

echo "Token: ${TOKEN:0:20}..."

# Test MIS endpoints
echo "3. Executive KPI Dashboard..."
curl -s "$BASE_URL/api/control/v1/reports/executive-kpi" \
  -H "Authorization: Bearer $TOKEN" | jq '.summary'

echo "4. Financial TCO..."
curl -s "$BASE_URL/api/control/v1/reports/financial/tco" \
  -H "Authorization: Bearer $TOKEN" | jq '.summary'

echo "5. Branch Benchmarking..."
curl -s "$BASE_URL/api/control/v1/reports/branch-benchmarking" \
  -H "Authorization: Bearer $TOKEN" | jq '.summary'

echo "6. Compliance Scorecard..."
curl -s "$BASE_URL/api/control/v1/reports/compliance-scorecard" \
  -H "Authorization: Bearer $TOKEN" | jq '.summary'

echo "7. MIS Unified Report..."
curl -s "$BASE_URL/api/control/v1/reports/mis?groupBy=branch" \
  -H "Authorization: Bearer $TOKEN" | jq '.summary'

echo "All tests complete!"
```

```bash
# Run test script
chmod +x test-mis-backend.sh
./test-mis-backend.sh
```

---

### Step 3: Frontend Deployment

#### 3.1 Install Frontend Dependencies

```bash
# Navigate to dashboard folder
cd dashboard

# Install dependencies
npm install

# Verify critical packages
npm list | grep -E "(next|react|recharts|react-to-print|xlsx)"
```

#### 3.2 Configure Frontend Environment

```bash
# Create production environment file
nano .env.production
```

```bash
# API Configuration
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com

# Application
NEXT_PUBLIC_APP_NAME=Surveillance MIS
NEXT_PUBLIC_APP_VERSION=1.0.0

# Features
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_ENABLE_EXPORT=true
NEXT_PUBLIC_ENABLE_AUTO_REFRESH=true

# Google Analytics (optional)
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

#### 3.3 Build Frontend

```bash
# Build for production
npm run build

# Verify build
ls -la .next/

# Expected: .next/ folder with optimized production build
```

#### 3.4 Start Frontend Service

**Option A: Next.js Server (Simple)**
```bash
# Start production server
npm run start

# Server starts on port 3001 by default
```

**Option B: PM2 (Recommended)**
```bash
# Start with PM2
pm2 start npm --name surveillance-mis-frontend -- start

# Configure auto-restart
pm2 startup
pm2 save

# Check status
pm2 list
```

**Option C: Static Export + Nginx (Best Performance)**
```bash
# Export static files
npm run build
npm run export

# Files will be in 'out/' directory
ls -la out/

# Configure Nginx
sudo nano /etc/nginx/sites-available/surveillance-mis
```

```nginx
server {
    listen 80;
    server_name dashboard.yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name dashboard.yourdomain.com;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # Root directory
    root /var/www/surveillance-mis/out;
    index index.html;
    
    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';" always;
    
    # API proxy
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Static files caching
    location /_next/static {
        alias /var/www/surveillance-mis/out/_next/static;
        expires 365d;
        access_log off;
    }
    
    # Images caching
    location ~* \.(jpg|jpeg|png|gif|ico|svg)$ {
        expires 30d;
        access_log off;
    }
    
    # Handle Next.js routing
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Error pages
    error_page 404 /404.html;
    error_page 500 502 503 504 /500.html;
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/surveillance-mis /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Copy built files
sudo mkdir -p /var/www/surveillance-mis
sudo cp -r out/* /var/www/surveillance-mis/
sudo chown -R www-data:www-data /var/www/surveillance-mis
```

#### 3.5 Verify Frontend

```bash
# Open browser
open https://dashboard.yourdomain.com

# Or test with curl
curl -I https://dashboard.yourdomain.com

# Expected: HTTP/2 200 OK
```

---

### Step 4: SSL/TLS Setup (Production)

#### 4.1 Install Let's Encrypt Certificate

```bash
# Install Certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d dashboard.yourdomain.com -d api.yourdomain.com

# Test auto-renewal
sudo certbot renew --dry-run

# Certificates auto-renew via cron
```

#### 4.2 Configure HTTPS Redirect

Already configured in Nginx config above. Verify:

```bash
# Test HTTP redirect
curl -I http://dashboard.yourdomain.com

# Expected: 301 Moved Permanently → https://
```

---

### Step 5: Post-Deployment Verification

#### 5.1 Smoke Tests

**Backend Health:**
```bash
# Check backend health
curl https://api.yourdomain.com/health

# Expected: {"status":"ok","timestamp":"2026-09-17T..."}
```

**Frontend Access:**
```bash
# Check frontend loads
curl -I https://dashboard.yourdomain.com

# Expected: 200 OK
```

**Database Connection:**
```bash
# Check from backend logs
pm2 logs surveillance-mis-backend | grep "Database connected"

# Or run database test
psql -U surveillance_user -d surveillance -c "SELECT COUNT(*) FROM incidents;"
```

#### 5.2 End-to-End Test

**Test Workflow:**
1. Open browser: `https://dashboard.yourdomain.com`
2. Login with admin credentials
3. Navigate to MIS Dashboard: `/mis-dashboard`
4. Verify KPI cards load with data
5. Click "Export PDF" - file should download
6. Navigate to Financial TCO: `/reports/financial`
7. Verify cost breakdown displays
8. Click "Export Excel" - file should download
9. Navigate to Branch Benchmarking: `/reports/benchmarking`
10. Verify branch comparison table loads
11. Test filters (date range, branch selection)
12. Test auto-refresh toggle

**Expected Results:**
- All pages load in < 5 seconds
- All charts render correctly
- All exports work (PDF, Excel)
- No console errors (F12)
- Auto-refresh updates data every 60 seconds

#### 5.3 Performance Verification

```bash
# Run performance test
npm run test:performance

# Or manual timing
time curl -s https://api.yourdomain.com/api/control/v1/reports/executive-kpi \
  -H "Authorization: Bearer <token>" > /dev/null

# Expected: < 3 seconds
```

#### 5.4 Monitoring Setup

**Install Monitoring Tools:**
```bash
# Install monitoring stack (optional but recommended)
# Prometheus + Grafana for metrics
# ELK stack for logs
# Uptime monitoring (UptimeRobot, Pingdom)
```

**Configure Alerts:**
- Backend down: Send email/SMS to DevOps
- Database slow queries: Alert DBA
- High error rate: Alert development team
- Disk space low: Alert infrastructure team

---

### Step 6: Backup Configuration

#### 6.1 Database Backup

**Automated Daily Backup:**
```bash
# Create backup script
sudo nano /usr/local/bin/backup-mis-db.sh
```

```bash
#!/bin/bash
# backup-mis-db.sh

BACKUP_DIR="/backups/surveillance"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="surveillance_mis_${DATE}.sql.gz"

# Create backup directory
mkdir -p $BACKUP_DIR

# Dump database and compress
pg_dump -U surveillance_user surveillance | gzip > $BACKUP_DIR/$FILENAME

# Keep only last 30 days of backups
find $BACKUP_DIR -name "surveillance_mis_*.sql.gz" -mtime +30 -delete

# Upload to S3 (optional)
# aws s3 cp $BACKUP_DIR/$FILENAME s3://your-bucket/backups/

echo "Backup completed: $FILENAME"
```

```bash
# Make executable
sudo chmod +x /usr/local/bin/backup-mis-db.sh

# Add to crontab (run daily at 2 AM)
sudo crontab -e
```

```cron
# MIS Database Backup
0 2 * * * /usr/local/bin/backup-mis-db.sh >> /var/log/mis-backup.log 2>&1
```

#### 6.2 Restore from Backup

```bash
# List available backups
ls -lh /backups/surveillance/

# Restore from backup
gunzip -c /backups/surveillance/surveillance_mis_20260917_020000.sql.gz | \
  psql -U surveillance_user surveillance

# Verify restore
psql -U surveillance_user surveillance -c "SELECT COUNT(*) FROM incidents;"
```

---

### Step 7: User Setup

#### 7.1 Create User Roles

**Phase 1-2 (Basic Auth):**
```sql
-- Users already exist in database
-- Verify user accounts
SELECT id, email, role, created_at FROM users ORDER BY created_at;
```

**Phase 3 (RBAC):**
```sql
-- Insert user roles
INSERT INTO user_roles (name, description, permissions) VALUES
  ('super_admin', 'Super Administrator', '{"reports": ["*"]}'),
  ('ceo', 'Chief Executive Officer', '{"reports": ["executive-kpi", "financial-tco", "branch-benchmarking", "compliance", "mis-unified"]}'),
  ('cfo', 'Chief Financial Officer', '{"reports": ["executive-kpi", "financial-tco", "financial-roi", "branch-benchmarking", "mis-unified"]}'),
  ('coo', 'Chief Operating Officer', '{"reports": ["executive-kpi", "branch-benchmarking", "compliance", "mis-unified"]}'),
  ('compliance_officer', 'Compliance Officer', '{"reports": ["compliance", "mis-unified"]}'),
  ('branch_manager', 'Branch Manager', '{"reports": ["branch-benchmarking", "compliance", "mis-unified"]}'),
  ('finance_analyst', 'Finance Analyst', '{"reports": ["financial-tco", "financial-roi", "mis-unified"]}'),
  ('viewer', 'View Only', '{"reports": ["executive-kpi"]}');

-- Assign roles to users
UPDATE users SET role_id = (SELECT id FROM user_roles WHERE name = 'ceo') 
WHERE email = 'ceo@company.com';

UPDATE users SET role_id = (SELECT id FROM user_roles WHERE name = 'cfo') 
WHERE email = 'cfo@company.com';

-- Verify assignments
SELECT u.email, ur.name as role 
FROM users u 
JOIN user_roles ur ON u.role_id = ur.id;
```

#### 7.2 Send Welcome Emails

**Email Template:**
```
Subject: Welcome to MIS Reporting System

Hi [Name],

Your account has been created for the new MIS Reporting System!

Login URL: https://dashboard.yourdomain.com
Username: [email]
Temporary Password: [password]

Please change your password on first login.

Available Reports (based on your role):
- Executive KPI Dashboard
- Financial TCO & ROI
- Branch Benchmarking
- Compliance Scorecard

Training Session: [Date & Time]
User Guide: https://docs.yourdomain.com/mis-user-guide

Questions? Contact support@yourdomain.com

Best regards,
IT Team
```

---

### Step 8: Rollback Plan

#### 8.1 Prepare Rollback

**Before Deployment:**
```bash
# Tag current production version
git tag -a v2.0-pre-mis -m "Before MIS deployment"
git push origin v2.0-pre-mis

# Backup database
/usr/local/bin/backup-mis-db.sh

# Backup current code
tar -czf /backups/code/surveillance-$(date +%Y%m%d).tar.gz /opt/surveillance/
```

#### 8.2 Execute Rollback (if needed)

```bash
# Stop current services
pm2 stop surveillance-mis-backend
pm2 stop surveillance-mis-frontend

# Restore code
cd /opt/surveillance
git checkout v2.0-pre-mis

# Rebuild
npm run build
cd dashboard && npm run build

# Restore database (if migrations failed)
gunzip -c /backups/surveillance/surveillance_mis_20260917_020000.sql.gz | \
  psql -U surveillance_user surveillance

# Restart services
pm2 restart surveillance-mis-backend
pm2 restart surveillance-mis-frontend

# Verify rollback
curl https://api.yourdomain.com/health
```

---

## Deployment Checklist

### Pre-Deployment
- [ ] Database backup completed
- [ ] Code backup completed
- [ ] Environment variables configured
- [ ] SSL certificates installed
- [ ] DNS configured
- [ ] Firewall rules updated
- [ ] Monitoring configured
- [ ] Alert rules set
- [ ] Stakeholders notified
- [ ] Rollback plan documented

### Deployment
- [ ] Database migrations run successfully
- [ ] Backend deployed and started
- [ ] Frontend deployed and started
- [ ] Nginx/reverse proxy configured
- [ ] HTTPS redirect working
- [ ] Health checks passing

### Post-Deployment
- [ ] Smoke tests passed
- [ ] End-to-end tests passed
- [ ] Performance tests passed
- [ ] User accounts created
- [ ] Welcome emails sent
- [ ] Training sessions scheduled
- [ ] Documentation published
- [ ] Support team briefed
- [ ] Success metrics baseline captured
- [ ] Post-deployment review scheduled

---

# Part 2: User Training Materials

## Training Program Overview

### Target Audiences

**Executive Track (2 hours):**
- CEO, Board Members, C-Suite
- Focus: Strategic insights, KPI interpretation
- Reports: Executive Dashboard, Branch Benchmarking

**Finance Track (3 hours):**
- CFO, Finance Team, Accountants
- Focus: Cost analysis, ROI calculation, Excel workflows
- Reports: Financial TCO/ROI, Branch Benchmarking

**Operations Track (2 hours):**
- COO, Branch Managers, Operations Team
- Focus: Performance metrics, benchmarking, improvements
- Reports: Branch Benchmarking, Compliance, MIS Unified

**Compliance Track (2.5 hours):**
- Compliance Officer, Audit Team, Legal
- Focus: Regulatory requirements, audit trails, evidence
- Reports: Compliance Scorecard, MIS Unified

**IT/Admin Track (4 hours):**
- IT Staff, System Administrators
- Focus: System management, troubleshooting, user support
- All Reports + Admin Functions

---

## Executive Training (2 Hours)

### Session 1: Introduction (30 min)

**Topics:**
- What is MIS and why it matters
- Business value: $401K/year, 334% ROI
- How MIS helps executives make better decisions
- System overview and navigation

**Activities:**
- Live demo of dashboard
- Q&A session

**Materials:**
- PowerPoint presentation (20 slides)
- Quick reference card
- Login credentials

---

### Session 2: Executive KPI Dashboard (45 min)

**Learning Objectives:**
- Understand the 4 KPI categories (Security, Operations, Financial, Risk)
- Interpret scores and trends
- Identify when action is needed
- Use auto-refresh and export features

**Demo Script:**

1. **Login and Navigation (5 min)**
   ```
   - Open browser: https://dashboard.yourdomain.com
   - Enter credentials
   - Navigate to MIS Dashboard (/mis-dashboard)
   ```

2. **KPI Cards Overview (10 min)**
   ```
   - Security Posture Score: What does 94/100 mean?
     → 90-100: Excellent
     → 80-89: Good
     → 70-79: Fair
     → <70: Needs attention
   
   - Operational Efficiency: What affects this?
     → System uptime
     → Alert resolution rate
     → False positive rate
     → Staff utilization
   
   - Financial Health: How is this calculated?
     → Monthly OpEx vs budget
     → Cost per monitored asset
     → Maintenance cost trend
   
   - Risk Indicators: When to escalate?
     → High-risk branches (top 10)
     → Unresolved P1/P2 incidents
     → Predicted failures
   ```

3. **Trend Charts (10 min)**
   ```
   - 6-month historical trends
   - Identify patterns (seasonal, growth)
   - Compare metrics side-by-side
   ```

4. **Export Reports (10 min)**
   ```
   - Click "Export PDF" button
   - Review PDF in browser
   - Save for board meetings
   
   - Click "Export Excel" button
   - Open Excel file
   - Review multiple sheets
   - Note: Can analyze further in Excel
   ```

5. **Auto-Refresh (5 min)**
   ```
   - Toggle auto-refresh ON
   - Watch countdown (60 seconds)
   - Data updates automatically
   - Use case: Keep dashboard open on second monitor
   ```

6. **Hands-On Practice (15 min)**
   ```
   - Each executive navigates dashboard
   - Practice exporting reports
   - Ask questions
   ```

**Exercise:**
- Each executive exports a PDF report
- Identify top 3 insights from their dashboard
- Share with group

---

### Session 3: Branch Benchmarking (30 min)

**Learning Objectives:**
- Compare branch performance across all locations
- Identify best and worst performers
- Understand improvement recommendations
- Use for strategic planning

**Demo Script:**

1. **Navigate to Benchmarking (5 min)**
   ```
   - Click "Branch Benchmarking" in sidebar
   - Review performance matrix table
   ```

2. **Interpret Scores (10 min)**
   ```
   - Overall Score (0-100): Composite of all metrics
   - Security Score: Incident rate, response time
   - Operations Score: Uptime, maintenance
   - Cost Efficiency: Cost per camera, per sq ft
   
   - Color coding:
     → Green (90-100): Top performers
     → Yellow (70-89): Average
     → Red (<70): Needs improvement
   ```

3. **Sort and Filter (5 min)**
   ```
   - Click column headers to sort
   - Filter by region/zone
   - Search for specific branch
   ```

4. **Improvement Actions (10 min)**
   ```
   - Click on underperforming branch
   - Review specific issues
   - See actionable recommendations
   
   Example:
   "Branch Mumbai-South: 68/100
    Issues:
    - Incident response time 25% higher than average
    - 3 cameras offline for 7+ days
    - Staff utilization 65% (target: 80%)
    
    Recommendations:
    - Hire 2 additional SOC operators
    - Replace 3 offline cameras (budget: $1,500)
    - Conduct training refresh for existing staff"
   ```

**Exercise:**
- Identify top 3 and bottom 3 branches
- List one improvement action for each bottom performer
- Calculate expected ROI of improvements

---

### Session 4: Q&A and Next Steps (15 min)

**Common Questions:**

**Q: How often is data updated?**
A: Real-time with 60-second auto-refresh. Database queries run every minute.

**Q: Can I schedule reports to be emailed?**
A: Yes! Phase 3 feature coming next month. Currently, export and email manually.

**Q: What if I see a data anomaly?**
A: Click "Report Issue" button or contact IT support. Include screenshot.

**Q: Can I access on my iPad?**
A: Yes! Fully responsive. Just open browser and login.

**Q: Who has access to financial reports?**
A: CFO, Finance team, and executives with finance permissions (Phase 3).

**Next Steps:**
- [ ] Change password on first login
- [ ] Bookmark dashboard URL
- [ ] Set up mobile bookmark (iPad/iPhone)
- [ ] Schedule monthly review meeting
- [ ] Provide feedback to IT team

---

## Finance Training (3 Hours)

### Session 1: Financial TCO Report (90 min)

**Learning Objectives:**
- Understand Total Cost of Ownership calculation
- Analyze CapEx vs OpEx breakdown
- Identify cost optimization opportunities
- Export and analyze in Excel

**Topics:**
1. TCO Concepts (15 min)
2. CapEx Breakdown (20 min)
3. OpEx Breakdown (20 min)
4. Hidden Costs (15 min)
5. Cost per Branch Analysis (20 min)

**Hands-On Exercise:**
- Export Financial TCO to Excel
- Calculate cost per camera for your branches
- Identify top 3 cost optimization opportunities
- Present findings to group

---

### Session 2: ROI Calculation (60 min)

**Learning Objectives:**
- Calculate return on investment for security
- Quantify prevented losses
- Measure operational efficiency gains
- Present ROI to executives

**Topics:**
1. ROI Formula and Components
2. Prevented Losses Calculation
3. Operational Savings
4. Compliance Cost Avoidance
5. Creating ROI Presentations

**Hands-On Exercise:**
- Review actual ROI from last quarter
- Calculate 3-year projected ROI
- Create executive summary slide

---

### Session 3: Excel Analysis Workflows (30 min)

**Advanced Excel Techniques:**
- Pivot tables from MIS exports
- Trend analysis with formulas
- Budget variance calculations
- Custom charts and dashboards

**Templates Provided:**
- Budget tracking template
- Cost analysis template
- ROI calculator template

---

## Operations Training (2 Hours)

### Session 1: Branch Benchmarking Deep Dive (60 min)

**Learning Objectives:**
- Use benchmarking for continuous improvement
- Set performance targets
- Track progress over time
- Share best practices

**Topics:**
1. Performance Scoring Methodology
2. Identifying Best Practices from Top Performers
3. Creating Improvement Plans
4. Measuring Progress

---

### Session 2: MIS Unified Report (60 min)

**Learning Objectives:**
- Use multi-dimensional analysis
- Switch between grouping dimensions
- Filter by organization/zone/region/area/branch
- Analyze time-based patterns

**Demo:**
- All 7 grouping dimensions
- Date-wise and time-wise breakdowns
- Shift-based analysis
- CSV export for further analysis

---

## Quick Reference Guides

### Executive Quick Reference Card

```
┌─────────────────────────────────────────────┐
│   MIS REPORTS - EXECUTIVE QUICK REFERENCE    │
├─────────────────────────────────────────────┤
│                                              │
│ LOGIN: https://dashboard.yourdomain.com     │
│                                              │
│ YOUR REPORTS:                                │
│ • Executive Dashboard (/mis-dashboard)       │
│ • Branch Benchmarking (/reports/benchmarking│
│                                              │
│ QUICK ACTIONS:                               │
│ • Export PDF: Click "Export PDF" button      │
│ • Export Excel: Click "Export Excel" button  │
│ • Auto-refresh: Toggle ON for real-time data │
│                                              │
│ KPI SCORE GUIDE:                             │
│ • 90-100: Excellent (green)                  │
│ • 80-89: Good (light green)                  │
│ • 70-79: Fair (yellow)                       │
│ • <70: Needs Attention (red)                 │
│                                              │
│ SUPPORT:                                     │
│ • Email: support@yourdomain.com              │
│ • Phone: 1-800-XXX-XXXX                      │
│ • Help: Click "?" icon in top right          │
│                                              │
│ TIPS:                                        │
│ • Works on iPad/iPhone                       │
│ • Use Chrome for best experience             │
│ • Set auto-refresh ON for monitoring         │
│ • Export PDF for board meetings              │
│                                              │
└─────────────────────────────────────────────┘
```

---

### Finance Quick Reference Card

```
┌─────────────────────────────────────────────┐
│   MIS REPORTS - FINANCE QUICK REFERENCE      │
├─────────────────────────────────────────────┤
│                                              │
│ YOUR REPORTS:                                │
│ • Financial TCO (/reports/financial)         │
│ • Branch Benchmarking (/reports/benchmarking│
│ • MIS Unified (/reports/mis)                 │
│                                              │
│ COST BREAKDOWN:                              │
│ • CapEx: Cameras, NVRs, infrastructure       │
│ • OpEx: Electricity, bandwidth, labor, AMC   │
│ • Hidden: Downtime, false alarms, training   │
│                                              │
│ ROI CALCULATION:                             │
│ ROI = (Benefits - Costs) / Costs × 100%      │
│                                              │
│ Benefits:                                    │
│ • Prevented losses (theft, fraud)            │
│ • Operational efficiency                     │
│ • Compliance cost avoidance                  │
│                                              │
│ EXCEL EXPORT:                                │
│ • Multi-sheet workbook                       │
│ • Summary + Details + Trends                 │
│ • Ready for pivot tables                     │
│                                              │
│ ANALYSIS TIPS:                               │
│ • Compare month-over-month                   │
│ • Identify cost spikes                       │
│ • Calculate cost per camera per branch       │
│ • Track budget variance weekly               │
│                                              │
└─────────────────────────────────────────────┘
```

---

## Troubleshooting Guide

### Common Issues

#### Issue 1: "Cannot login" / "Invalid credentials"

**Symptoms:**
- Login page shows "Invalid email or password"
- Session expires quickly

**Solutions:**
1. Verify credentials (check welcome email)
2. Reset password: Click "Forgot Password"
3. Clear browser cache: Ctrl+Shift+Delete
4. Try different browser (Chrome recommended)
5. Contact IT if issue persists

---

#### Issue 2: "Report loads slowly" / "Timeout error"

**Symptoms:**
- Report takes > 10 seconds to load
- Shows "Request timeout" error

**Solutions:**
1. Check internet connection speed (min 10 Mbps)
2. Reduce date range (try last 30 days instead of 90)
3. Filter by specific branch (reduces data volume)
4. Clear browser cache
5. Contact IT to check server load

---

#### Issue 3: "Export fails" / "Download doesn't work"

**Symptoms:**
- Click "Export PDF" but nothing happens
- Excel file is corrupt or won't open

**Solutions:**
1. Check browser allows downloads (not blocked)
2. Disable popup blocker for this site
3. Try exporting smaller date range
4. Use different export format (PDF vs Excel)
5. Contact IT if issue persists

---

#### Issue 4: "Charts not displaying" / "Blank page"

**Symptoms:**
- See layout but no data in charts
- Page is blank or partially loaded

**Solutions:**
1. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. Enable JavaScript (must be on)
3. Update browser to latest version
4. Disable browser extensions (ad blockers)
5. Try incognito/private mode

---

#### Issue 5: "Data looks wrong" / "Numbers don't match"

**Symptoms:**
- Metrics don't match expected values
- Suddenly different from yesterday

**Solutions:**
1. Check date range filter (may be wrong period)
2. Check branch filter (may be filtered to one branch)
3. Verify you're on correct report page
4. Refresh page (Ctrl+R)
5. Report to IT with screenshot if still incorrect

---

## Support Resources

### Contact Information

**IT Support:**
- Email: support@yourdomain.com
- Phone: 1-800-XXX-XXXX
- Hours: Mon-Fri 8am-6pm

**Emergency After-Hours:**
- Phone: 1-800-XXX-XXXX ext 911
- For production outages only

### Documentation

**Online Resources:**
- User Guide: https://docs.yourdomain.com/mis-user-guide
- Video Tutorials: https://docs.yourdomain.com/mis-videos
- FAQ: https://docs.yourdomain.com/mis-faq
- Release Notes: https://docs.yourdomain.com/mis-releases

### Training

**Upcoming Sessions:**
- Executive Training: Monthly, 1st Tuesday
- Finance Training: Quarterly
- Operations Training: Monthly, 3rd Thursday
- New User Orientation: Weekly, Fridays

**Register:** training@yourdomain.com

---

## Appendix

### A. Keyboard Shortcuts

```
Global:
- Ctrl+/ : Show help
- Ctrl+R : Refresh current page
- Esc : Close modal/dialog

Navigation:
- Alt+1 : Go to Dashboard
- Alt+2 : Go to Financial Reports
- Alt+3 : Go to Benchmarking
- Alt+4 : Go to Compliance

Reports:
- Ctrl+E : Export PDF
- Ctrl+Shift+E : Export Excel
- Ctrl+P : Print report
- Ctrl+F : Search/Filter
```

### B. Browser Requirements

**Supported Browsers:**
- Chrome 90+ (Recommended)
- Firefox 88+
- Safari 14+
- Edge 90+

**Not Supported:**
- Internet Explorer (any version)
- Chrome < 90
- Safari < 14

### C. Data Retention Policy

**Reports:**
- Real-time: Current data
- Historical: 24 months available
- Exports: Download to your device (not stored on server)

**Audit Logs:**
- 7 years (compliance requirement)

### D. Security Best Practices

**For Users:**
- Use strong, unique password (12+ characters)
- Enable 2FA (Two-Factor Authentication) when available
- Never share credentials
- Log out when leaving computer
- Report suspicious activity immediately

**For Admins:**
- Review access logs monthly
- Remove inactive users quarterly
- Update permissions as roles change
- Monitor failed login attempts
- Keep software updated

---

**Document Version:** 1.0  
**Last Updated:** September 17, 2026  
**Next Review:** After pilot deployment

**Feedback:** Please send feedback to documentation@yourdomain.com

---

*This guide will be updated based on user feedback and system updates. Check online documentation for latest version.*
