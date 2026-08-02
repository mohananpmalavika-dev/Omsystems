# Sentinel Grid - Architecture Analysis & Recommendations for 500+ Branch Deployment

## Executive Summary

Your project has a **solid foundation** but needs critical enhancements for true 24/7, cloud-based operation across 500+ branches with zero on-premise dependencies. This analysis identifies gaps and provides actionable recommendations.

---

## Current Architecture Overview

### ✅ **What You Have (Strong Foundation)**

1. **Multi-Tenant Hierarchical Structure**
   - Company → Division → Region → Branch → Camera hierarchy
   - Role-based access control (11 roles: super_admin to viewer)
   - Hierarchical permissions (users can access specific branches, zones, regions)
   - PostgreSQL with ltree for efficient hierarchy queries

2. **Edge Agent (Windows-based)**
   - Automatic ONVIF camera discovery on branch LAN
   - Cloudflared tunnel integration for secure remote access
   - Local MediaMTX for RTSP-to-HLS conversion
   - Camera heartbeat monitoring and health reporting
   - Automatic recovery workflows (RTSP reconnect, ONVIF reboot, etc.)

3. **Backend Services**
   - Camera monitor service with adaptive polling
   - Integration framework for external systems (access control, fire alarms, ATM monitoring)
   - Analytics engine with AI/ML capabilities
   - Recording engine with S3 archival
   - Media gateway for live streaming

4. **Authentication & Security**
   - JWT-based authentication
   - Session management
   - Encrypted credential storage
   - Audit logging

---

## ❌ **Critical Gaps for 500+ Branch, 24/7 Cloud Operation**

### 1. **HIGH AVAILABILITY & DISASTER RECOVERY** ⚠️ **CRITICAL**

#### Current Issues:
- **Single point of failure**: All services run as single instances
- **No database replication**: PostgreSQL runs standalone
- **No automatic failover**: If any service crashes, manual intervention needed
- **No load balancing**: All traffic hits single instances
- **No geographic redundancy**: Everything in one region (Singapore for Render deployment)

#### Impact on Your Use Case:
- ❌ Any service failure = entire system down for ALL 500 branches
- ❌ Database failure = complete data loss without backup
- ❌ No 24/7 guarantee - downtime will occur

#### Required Solutions:
```yaml
# Required Changes:
1. Database High Availability:
   - PostgreSQL Primary-Replica setup (1 primary + 2 replicas minimum)
   - Automatic failover with Patroni or managed service (AWS RDS Multi-AZ)
   - Connection pooling with PgBouncer
   - Read replicas for reporting queries

2. Service High Availability:
   - Run minimum 3 instances of each critical service
   - Implement health checks and automatic restart
   - Use Kubernetes with pod autoscaling
   - Cross-region deployment for disaster recovery

3. Load Balancing:
   - API Gateway (Kong, Traefik, or AWS ALB)
   - Distribute load across service instances
   - Circuit breaker patterns
   - Request rate limiting per tenant

4. Message Queue for Async Processing:
   - RabbitMQ or AWS SQS for heartbeat processing
   - Redis Streams for real-time events
   - Prevents overwhelming services during spikes
```

---

### 2. **AUTOMATIC CAMERA ONBOARDING** ⚠️ **HIGH PRIORITY**

#### Current Issues:
- Edge agent discovers ONVIF cameras automatically ✅
- **BUT**: Cameras still need manual approval in dashboard ❌
- **No workflow** for non-technical staff to add cameras
- Edge agent requires technical configuration (activation codes, branch IDs)

#### Impact on Your Use Case:
- ❌ 500 branches × 10-20 cameras = 5,000-10,000 cameras
- ❌ Manual approval = massive bottleneck for your team
- ❌ Non-technical branch staff cannot add cameras themselves

#### Required Solutions:
```typescript
// AUTO-APPROVAL WORKFLOW

1. Zero-Touch Camera Onboarding:
   ✅ Edge agent discovers cameras on LAN (already implemented)
   + Auto-register discovered cameras with "pending" status
   + AI-based camera validation (check if it's actually a camera, not random device)
   + Auto-assign camera to correct zone based on IP subnet mapping
   + Branch-level rules: "Auto-approve cameras from known vendors"
   + Notification to admins only for anomalies

2. Branch-Specific Auto-Approval Rules:
   CREATE TABLE branch_onboarding_rules (
     id UUID PRIMARY KEY,
     branch_id UUID NOT NULL,
     auto_approve_known_vendors BOOLEAN DEFAULT true,
     allowed_vendors TEXT[] DEFAULT ARRAY['hikvision', 'dahua', 'cp-plus'],
     require_admin_approval_after INTEGER DEFAULT 5, -- alert after 5 auto-approved
     max_cameras_per_day INTEGER DEFAULT 20,
     notification_recipients UUID[]
   );

3. Edge Agent Self-Registration:
   - Generate unique branch activation QR code in dashboard
   - Branch staff scans QR code with phone
   - QR code contains: branch_id, activation_token, WiFi credentials
   - Edge agent auto-configures itself from QR code
   - No technical knowledge required

4. Bulk Import for Initial Setup:
   - CSV/Excel upload: Branch Name, Number of Cameras, IP Range
   - System pre-creates camera placeholders
   - When edge agent discovers matching camera, auto-links it
```

---

### 3. **RECORDING STORAGE & RETENTION** ⚠️ **CRITICAL**

#### Current Issues:
- Recording engine exists but **storage strategy unclear** for 500 branches
- Current Render setup: 100GB disk for ALL recordings ❌
- 500 branches × 10 cameras × 720p × 24/7 × 30 days = **~1.5 PB/month** ❌
- No multi-tiered storage (hot/warm/cold implemented in code but not operationalized)
- No automatic cleanup or retention policies enforced

#### Impact on Your Use Case:
- ❌ 100GB disk = can store ~4 hours of recordings for 50 cameras
- ❌ Completely insufficient for 500 branches × 24/7 operation
- ❌ Will run out of space within hours

#### Required Solutions:
```yaml
Storage Architecture for 500 Branches:

1. Tiered Storage Strategy:
   Tier 1 - Hot (Cloud/NVR): Last 7 days, instant access
     - Store on branch NVRs/DVRs (existing hardware)
     - Cloud cache for 500 most accessed cameras
     - Total: ~50TB (manageable)
   
   Tier 2 - Warm (S3 Standard): 8-90 days
     - AWS S3 Standard or equivalent
     - Lifecycle policy to auto-move after 7 days
     - Estimated: ~500TB/quarter
     - Cost: ~$12,000/month for S3 Standard
   
   Tier 3 - Cold (S3 Glacier): 91 days - 1 year
     - AWS S3 Glacier for compliance
     - Lifecycle policy auto-moves after 90 days
     - Estimated: ~1.5PB/year
     - Cost: ~$1,500/month for Glacier
   
   Tier 4 - Archive (S3 Deep Archive): 1-7 years
     - Legal/regulatory retention
     - Rarely accessed
     - Cost: ~$1/TB/month

2. Intelligent Recording (Reduce Storage by 70%):
   - Motion-triggered recording instead of continuous
   - Lower FPS during non-business hours (25fps → 10fps)
   - Adaptive bitrate based on activity
   - Delete recordings with no motion/events after retention period

3. Branch-Local NVR/DVR Integration (PRIORITY):
   ✅ You already have RECORDERS_JSON in edge agent config
   + Enhance to make NVR the PRIMARY storage
   + Cloud as BACKUP and for remote viewing
   + Edge agent checks NVR health and available storage
   + Auto-cleanup old recordings from NVRs
   + Upload only INCIDENTS to cloud, not all footage

4. Recording Engine Scaling:
   - Deploy 1 recording engine instance per region (not single global)
   - Each handles 50-100 branches
   - Regional S3 buckets for lower latency
   - Cross-region replication for disaster recovery
```

---

### 4. **NETWORK BANDWIDTH OPTIMIZATION** ⚠️ **HIGH PRIORITY**

#### Current Issues:
- 500 branches simultaneously streaming to cloud = **MASSIVE bandwidth**
- 500 branches × 10 cameras × 2 Mbps × 24/7 = **10 Gbps continuous upload** ❌
- Cost: ~$50,000+/month for bandwidth alone
- Many branches may have slow upload speeds (1-10 Mbps)

#### Required Solutions:
```yaml
Bandwidth Optimization Strategy:

1. **Edge-First Architecture** (Current Cloudflared is good, but enhance):
   - Live view: Stream from edge agent → cloudflared tunnel → user
   - Do NOT relay through central cloud servers
   - Current implementation partially correct, verify end-to-end

2. **Smart Recording Upload**:
   - Upload ONLY incidents/alerts to cloud, not continuous footage
   - Branch NVRs store continuous footage locally
   - User requests old footage? Edge agent pulls from NVR on-demand
   - Compression before upload (H.265 instead of H.264)

3. **Adaptive Streaming**:
   - Sub-streams for live view (low resolution, low FPS)
   - Main stream only when user clicks "HD" or recording incident
   - Already supported by ONVIF profiles, implement client-side logic

4. **Regional Edge Gateways** (for dense regions):
   - Deploy regional edge servers in cities with many branches
   - Branches connect to nearest regional gateway
   - Regional gateways aggregate and optimize before cloud
```

---

### 5. **SCALABILITY & PERFORMANCE** ⚠️ **HIGH PRIORITY**

#### Current Issues:
- Camera monitor service polls ALL cameras sequentially
- No job queue for processing heartbeats
- PostgreSQL will struggle with 500 branches × 10 cameras × heartbeat every 30s = **~16,000 DB writes/min**
- No caching layer for frequently accessed data
- No database connection pooling at scale

#### Required Solutions:
```yaml
Performance Optimizations:

1. Message Queue for Heartbeats:
   - RabbitMQ or AWS SQS
   - Edge agents publish heartbeats to queue
   - Multiple worker processes consume queue
   - Prevents overwhelming database

2. Redis for Caching:
   - Cache camera status (reduce DB queries by 90%)
   - Cache user permissions (hierarchical checks are expensive)
   - Store recent health data in Redis
   - PostgreSQL for persistent storage only

3. Database Optimization:
   - Partitioning: camera_health_history by month
   - Indexes on frequently queried columns
   - TimescaleDB extension for time-series data
   - Connection pooling (PgBouncer)

4. Horizontal Scaling:
   - Stateless services → easy to scale
   - Shard camera monitoring by region
   - Each region has dedicated monitor service instances
```

---

### 6. **MONITORING & ALERTING** ⚠️ **HIGH PRIORITY**

#### Current Issues:
- No observability platform mentioned
- How do you know if services are down?
- No metrics on camera health trends
- No automatic escalation when failures occur

#### Required Solutions:
```yaml
Observability Stack:

1. Metrics (Prometheus + Grafana):
   - Service health (API, edge agents, recording engine)
   - Camera online/offline counts per branch
   - Network bandwidth usage
   - Storage utilization
   - Database performance

2. Logging (ELK Stack or Loki):
   - Centralized logs from all 500 edge agents
   - Searchable incident logs
   - Correlation IDs for debugging

3. Alerting (PagerDuty or Opsgenie):
   - Branch offline → alert regional manager
   - Multiple cameras offline → alert operations team
   - Storage 90% full → alert infrastructure team
   - Automatic escalation after 15 minutes no response

4. Service Health Dashboard:
   - Real-time map showing branch status
   - Camera online counts per branch
   - Recent incidents
   - System-wide health score
```

---

### 7. **EDGE AGENT RELIABILITY** ⚠️ **MEDIUM PRIORITY**

#### Current Issues:
- Edge agent runs on single Windows PC at each branch ✅
- **What if that PC crashes/restarts?** ❌
- No automatic restart mechanism mentioned
- No health monitoring of edge agent itself from cloud
- PC might be turned off by branch staff

#### Required Solutions:
```yaml
Edge Agent Reliability:

1. Windows Service Installation (CRITICAL):
   ✅ Already configured as Windows Task Scheduler (good)
   + Add watchdog process that restarts agent if crashes
   + Log all crashes and send to cloud for analysis
   + Auto-update mechanism (currently manual)

2. Headless Operation:
   - Run as Windows Service (not console app)
   - No UI required
   - Cannot be accidentally closed by branch staff
   - Survives user logoff

3. Cloud Monitoring of Edge Agents:
   - If edge agent misses 3 heartbeats → alert
   - Differentiate between: branch internet down vs edge agent crashed vs all cameras offline
   - Remote restart capability via cloud command

4. Dual Edge Agent Setup (for critical branches):
   - 2 PCs at important branches
   - Active-passive failover
   - If primary edge agent fails, secondary takes over
```

---

### 8. **PERMISSION MANAGEMENT AT SCALE** ⚠️ **MEDIUM PRIORITY**

#### Current Issues:
- Good hierarchical permission model ✅
- **BUT**: Managing permissions for 500 branches manually = nightmare ❌
- No bulk permission assignment
- No role templates

#### Required Solutions:
```typescript
// Permission Management Enhancements

1. Role Templates:
   - Pre-defined templates: "Branch Manager", "Regional Security Officer"
   - Assign template to user → inherits all permissions
   - Update template → all users with that template updated

2. Bulk User Import:
   - CSV upload: Name, Email, Role, Assigned Branches
   - Auto-create users with correct permissions
   - Send welcome emails with login credentials

3. Organizational Sync:
   - Integrate with HR system (API or CSV sync)
   - Auto-create users when employee joins
   - Auto-disable when employee leaves
   - Auto-update when employee transfers branches

4. Permission Audit:
   - Who has access to what?
   - Who accessed camera X in last 30 days?
   - Compliance reports for auditors
```

---

### 9. **BACKUP & DISASTER RECOVERY** ⚠️ **CRITICAL**

#### Current Issues:
- No database backup strategy mentioned ❌
- No disaster recovery plan ❌
- Render provides backups, but restore process?

#### Required Solutions:
```yaml
Backup Strategy:

1. Database Backups:
   - Automated daily full backups
   - Hourly incremental backups
   - Retention: 30 days online, 1 year archived
   - Test restore monthly (automated)
   - Store backups in different region

2. Configuration Backups:
   - All edge agent configurations
   - Camera credentials (encrypted)
   - System settings

3. Disaster Recovery Plan:
   - RTO (Recovery Time Objective): 4 hours
   - RPO (Recovery Point Objective): 1 hour
   - Documented recovery procedures
   - DR drills quarterly

4. Multi-Region Deployment:
   - Primary: Singapore
   - Secondary: Mumbai or another Asian region
   - Automatic failover if primary region fails
```

---

## 📋 **PRIORITY ACTION PLAN**

### **Phase 1: Immediate (Week 1-2) - Make it Actually Work 24/7**
1. ✅ Set up PostgreSQL replication (Primary + 1 Replica)
2. ✅ Configure NVR/DVR as primary storage, cloud as backup
3. ✅ Add Redis for caching camera status
4. ✅ Implement database connection pooling
5. ✅ Set up basic monitoring (Grafana Cloud free tier)
6. ✅ Create automated database backups

### **Phase 2: Short-term (Week 3-4) - Auto-onboarding & Scale**
1. ✅ Implement auto-approval rules for camera onboarding
2. ✅ Create QR code-based edge agent setup
3. ✅ Add message queue (RabbitMQ) for heartbeats
4. ✅ Implement bulk user import
5. ✅ Deploy 3 instances of each service with load balancer
6. ✅ Set up alerting (PagerDuty or email-based)

### **Phase 3: Medium-term (Month 2-3) - Production Hardening**
1. ✅ Implement tiered storage strategy (Hot/Warm/Cold)
2. ✅ Deploy regional edge gateways for high-density areas
3. ✅ Add automatic failover for critical services
4. ✅ Implement comprehensive audit logging
5. ✅ Create disaster recovery runbooks
6. ✅ Horizontal scaling of camera monitoring service

### **Phase 4: Long-term (Month 4-6) - Enterprise Features**
1. ✅ Multi-region deployment with geo-redundancy
2. ✅ AI-powered camera health prediction
3. ✅ Advanced analytics and reporting
4. ✅ Mobile app for branch managers
5. ✅ Integration with HR systems for auto user provisioning
6. ✅ Self-service portal for branch staff

---

## 💰 **COST ESTIMATES (Monthly)**

### Current Render Setup (Insufficient for 500 Branches):
- Services: ~$200-300/month
- Database: ~$50/month (100GB)
- **Total**: ~$350/month
- **Problem**: Cannot handle 500 branches, will crash immediately

### Recommended Setup for 500 Branches:
```
Infrastructure:
- AWS/Azure VMs (Control Plane): $500/month
- PostgreSQL RDS Multi-AZ: $400/month
- Redis ElastiCache: $150/month
- RabbitMQ (managed): $200/month
- Load Balancers: $100/month

Storage (Tiered):
- S3 Standard (Warm): $12,000/month
- S3 Glacier (Cold): $1,500/month
- Branch NVR storage: $0 (use existing hardware)

Bandwidth:
- With optimization: $2,000-3,000/month
- Without optimization: $30,000+/month

Monitoring & Security:
- Grafana Cloud: $200/month
- Security tools: $300/month

Subtotal: ~$17,000-20,000/month

Additional (Optional):
- Cloudflare Business Plan (for all tunnels): $4,000/month
- Disaster Recovery Region: +50% = $10,000/month

TOTAL (Production-Ready): $25,000-35,000/month
```

### Cost Optimization Strategies:
1. **Use existing branch NVRs** as primary storage: Saves $10,000/month
2. **Motion-triggered recording** instead of continuous: Saves 70% storage
3. **Reserved instances** for VMs: Saves 40% on compute
4. **Regional deployment** (don't need multi-region for pilot): Saves $10,000/month

**Realistic Production Cost**: $15,000-20,000/month for 500 branches (24/7, reliable, scalable)

---

## 🎯 **KEY RECOMMENDATIONS**

### 1. **Leverage Existing NVR/DVRs** (Biggest Cost Saver)
Your branches already have NVRs/DVRs recording 24/7. Don't duplicate that in the cloud!
- Edge agent should just **monitor** recordings on NVR
- Upload **only incidents** to cloud for analytics
- Cloud serves as backup, not primary storage
- Saves 90% of cloud storage costs

### 2. **Deploy Edge-First Architecture**
- Live streaming: Branch edge agent → Cloudflared tunnel → User's browser
- Do NOT route through central servers
- Reduces bandwidth costs by 80%
- Lower latency for users

### 3. **Automate Everything**
- Camera onboarding (QR codes)
- Edge agent setup (one-click installer)
- User provisioning (bulk import)
- Backups and failover
- Your team of 3-4 cannot manually manage 500 branches

### 4. **Start Small, Scale Gradually**
- Pilot with 10 branches
- Validate architecture and costs
- Gradually onboard 50 → 100 → 500 branches
- Fix issues early before they multiply

### 5. **Monitoring is Non-Negotiable**
- You cannot manage 500 branches without real-time monitoring
- Invest in Grafana/Prometheus from day 1
- Set up alerts before going live

---

## 🚨 **CRITICAL BLOCKERS (Fix These First)**

1. **Database will crash under load**
   - Current: Single PostgreSQL instance, no replication
   - At 500 branches: ~16,000 writes/minute
   - Fix: Add replicas + connection pooling + Redis cache

2. **Storage will run out in hours**
   - Current: 100GB total storage
   - At 500 branches: Need ~50TB for 7 days
   - Fix: Integrate with branch NVRs, use S3 for incidents only

3. **No high availability = guaranteed downtime**
   - Current: Single instance of each service
   - At 500 branches: Any crash = entire system down
   - Fix: Run 3+ instances of each service with load balancer

4. **Bandwidth costs will be astronomical**
   - Current: All footage uploaded to cloud
   - At 500 branches: ~10Gbps = $50k+/month
   - Fix: Local NVR storage + edge-first streaming

5. **Manual camera approval won't scale**
   - Current: Admin must approve each camera in dashboard
   - At 500 branches: 5,000+ cameras to approve manually
   - Fix: Auto-approval rules + QR code onboarding

---

## 📁 **NEXT STEPS**

1. **Review this document** with your team
2. **Prioritize** which items are most critical for your use case
3. **Start with Phase 1** (database HA, NVR integration, basic monitoring)
4. **Pilot with 5-10 branches** to validate approach
5. **Iterate based on real-world feedback** before scaling to 500 branches

I'm here to help implement any of these recommendations. Let me know which area you'd like to tackle first!

---

## 📧 **Questions for You**

1. Do your 500 branches already have NVRs/DVRs installed? (This changes everything)
2. What's your current internet bandwidth at branches? (affects feasibility)
3. How many cameras per branch on average?
4. What's your retention requirement? (legal/compliance)
5. What's your budget for cloud infrastructure?
6. Do you have an operations team to monitor 24/7, or need fully automated?

