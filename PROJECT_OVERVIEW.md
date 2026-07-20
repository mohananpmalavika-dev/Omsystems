# Sentinel Grid - Complete Project Overview

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      USER INTERFACE                              │
├─────────────────────────────────────────────────────────────────┤
│  Next.js Dashboard (Port 3000)                                  │
│  • Branch/camera list                                            │
│  • Live video viewer (HLS.js)                                    │
│  • Authorization UI                                              │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP/REST
┌────────────────────────┴────────────────────────────────────────┐
│                   CONTROL PLANE (Port 8080)                      │
├─────────────────────────────────────────────────────────────────┤
│  • Branch/camera management                                      │
│  • Hierarchical RBAC (ltree)                                     │
│  • Live session tokens (60s TTL)                                 │
│  • Audit logging                                                 │
│  • Edge agent registration                                       │
└────────────┬──────────────────────────┬─────────────────────────┘
             │                          │
             │                          │ One-time token
             │                          ▼
             │                ┌─────────────────────────────────┐
             │                │ MEDIA GATEWAY (Port 8090)       │
             │                ├─────────────────────────────────┤
             │                │ • Token exchange                │
             │                │ • MediaMTX control              │
             │                │ • Stream secret resolution      │
             │                └────────┬────────────────────────┘
             │                         │
             │                         ▼
             │                ┌─────────────────────────────────┐
             │                │ MediaMTX (Ports 8888/8889)      │
             │                ├─────────────────────────────────┤
             │                │ • HLS transcoding               │
             │                │ • WebRTC/WHEP                   │
             │                │ • On-demand paths               │
             │                └────────┬────────────────────────┘
             │                         │ RTSP pull
             │                         ▼
             │                ┌─────────────────────────────────┐
             │                │ Cameras (ONVIF/RTSP)            │
             │                │ • 192.168.x.x                   │
             │                │ • Various vendors               │
             │                └─────────────────────────────────┘
             │                         ▲
             │                         │ WS-Discovery + RTSP
             │                         │
┌────────────┴──────────────┐         │
│  EDGE AGENT               │─────────┘
├───────────────────────────┤
│  • ONVIF discovery        │
│  • Camera inspection      │
│  • FFprobe validation     │
│  • Heartbeat              │
└───────────────────────────┘
             │
             ▼
┌───────────────────────────┐
│  PostgreSQL (Port 5432)   │
├───────────────────────────┤
│  • Tenants & users        │
│  • Resource hierarchy     │
│  • Grants & permissions   │
│  • Cameras & discoveries  │
│  • Audit events           │
│  • Live sessions          │
└───────────────────────────┘
```

## 🎯 What It Does

### For End Users
1. **Login** → View accessible branches
2. **Select branch** → See cameras
3. **Click "View Live"** → Instant video streaming
4. **Authorization** → Only see what you're allowed to

### For Administrators
1. **Deploy edge agent** → Automatic camera discovery
2. **Approve cameras** → Add to monitoring
3. **Manage permissions** → Grant/deny access by branch/group
4. **View audit logs** → Track all viewing activity

### Behind the Scenes
1. **Edge agent discovers cameras** via ONVIF multicast
2. **Validates streams** with FFprobe
3. **Submits to control plane** for approval
4. **User requests live view** → Control plane checks authorization
5. **Issues 60-second token** → User exchanges with media gateway
6. **Media gateway** creates on-demand MediaMTX path
7. **Video streams** via HLS or WebRTC
8. **Everything audited** → Who viewed what, when

## 📁 Project Structure

```
c:\Omsystems\
│
├── 📄 START_HERE.md                 ← Read this first!
├── 📄 GETTING_STARTED.md            ← Choose deployment path
├── 📄 QUICK_START_2_CAMERAS.md      ← Test with cameras
├── 📄 DEPLOYMENT_OPTIONS.md         ← Cloud deployment
├── 📄 PRODUCTION_READINESS_GAPS.md  ← Security review
├── 📄 CRITICAL_FIXES_CHECKLIST.md   ← Pre-launch tasks
│
├── 🚀 deploy/
│   ├── one-click-deploy.ps1         ← Windows deployment
│   └── one-click-deploy.sh          ← Linux/Mac deployment
│
├── 🎨 dashboard/                    ← Next.js UI
│   ├── app/                         ← Pages & API routes
│   ├── components/                  ← React components
│   │   ├── security-dashboard.tsx   ← Main dashboard
│   │   ├── camera-tile.tsx          ← Camera cards
│   │   └── hls-player.tsx           ← Video player
│   └── lib/                         ← Backend client
│
├── 🔧 src/                          ← Control Plane API
│   ├── app.ts                       ← Fastify routes
│   ├── database/                    ← PostgreSQL repositories
│   │   ├── postgres-store.ts        ← Store implementation
│   │   ├── camera-repository.ts     ← Camera CRUD
│   │   ├── user-repository.ts       ← User management
│   │   └── audit-repository.ts      ← Audit logging
│   └── domain/
│       ├── models.ts                ← Type definitions
│       └── authorization.ts         ← RBAC logic
│
├── 📹 edge-agent/                   ← Camera Discovery
│   ├── src/
│   │   ├── index.ts                 ← Main loop
│   │   ├── discovery/
│   │   │   └── onvif-discovery.ts   ← WS-Discovery
│   │   ├── devices/
│   │   │   ├── onvif-client.ts      ← ONVIF SOAP client
│   │   │   └── compatibility-registry.ts
│   │   └── streaming/
│   │       └── rtsp-probe.ts        ← FFprobe wrapper
│   └── .env.example                 ← Configuration
│
├── 🎬 media-gateway/                ← Media Routing
│   ├── src/
│   │   ├── app.ts                   ← Token exchange
│   │   ├── media-router.ts          ← MediaMTX control
│   │   ├── access-registry.ts       ← Path-scoped tokens
│   │   └── secret-provider.ts       ← Stream credentials
│   └── mediamtx.yml                 ← MediaMTX config
│
├── 🗃️ database/
│   └── migrations/
│       ├── 001_initial.sql          ← Schema setup
│       └── 002_edge_and_media_contract.sql
│
├── 📚 docs/
│   └── architecture.md              ← System design
│
├── 🧪 test/
│   ├── app.test.ts                  ← API tests
│   └── authorization.test.ts        ← RBAC tests
│
├── 🐳 Dockerfile                    ← Control plane image
├── 🐳 compose.yaml                  ← Multi-service setup
└── 📦 package.json                  ← Workspace config
```

## 🔄 User Flows

### Flow 1: Camera Discovery & Approval

```
1. Admin deploys edge agent at branch
   └─> Edge agent: node dist/src/index.js

2. Edge agent discovers cameras
   └─> Multicast: "who's on the network?"
   └─> Cameras respond with ONVIF endpoints

3. For each camera:
   └─> Connect to ONVIF service
   └─> Read device info, profiles, capabilities
   └─> Get RTSP URI
   └─> Validate with ffprobe
   └─> Submit discovery to control plane

4. Admin reviews pending discoveries
   └─> GET /v1/branches/{id}/cameras/discovered

5. Admin approves camera
   └─> POST /v1/branches/{id}/cameras
   └─> Camera added to monitoring
   └─> Audit event logged
```

### Flow 2: Live Video Viewing

```
1. User opens dashboard
   └─> https://dashboard.com

2. Dashboard fetches branches
   └─> GET /v1/branches (with user identity)
   └─> Control plane checks authorization
   └─> Returns accessible branches only

3. User clicks branch
   └─> GET /v1/branches/{id}/cameras
   └─> Returns authorized cameras only

4. User clicks "View Live"
   └─> POST /v1/cameras/{id}/live-sessions
   └─> Control plane checks live:view permission
   └─> Generates 60-second token
   └─> Stores SHA-256 hash
   └─> Returns token to user

5. Dashboard exchanges token
   └─> POST /v1/live/start (media gateway)
   └─> Media gateway validates with control plane
   └─> Control plane marks token consumed
   └─> Media gateway creates MediaMTX path
   └─> Returns HLS URL + bearer token

6. Video plays
   └─> HLS.js requests playlist
   └─> Authorization: Bearer <token>
   └─> MediaMTX validates with media gateway
   └─> Stream starts
   └─> User sees live video
```

### Flow 3: Authorization Check

```
User requests action on resource
   │
   ├─> Get user's grants from database
   │   └─> SELECT * FROM access_grants WHERE user_id = ?
   │
   ├─> Get resource hierarchy path
   │   └─> SELECT path FROM resource_nodes WHERE id = ?
   │
   ├─> Filter applicable grants
   │   └─> Grant scope path contains resource path (ltree)
   │
   ├─> Check for deny grants
   │   └─> If found: DENY (deny overrides allow)
   │
   ├─> Check for allow grants
   │   └─> If found: ALLOW
   │
   └─> Default: DENY (default-deny security model)
```

## 🎛️ Configuration Overview

### Control Plane (.env)
```bash
HOST=0.0.0.0                          # Listen address
PORT=8080                             # API port
DATABASE_URL=postgresql://...         # PostgreSQL connection
MEDIA_GATEWAY_SHARED_KEY=<strong>     # Gateway authentication
ALLOWED_ORIGINS=https://dashboard.com # CORS config
AUTH_MODE=development                 # Auth mode (oidc in prod)
```

### Media Gateway (.env)
```bash
CONTROL_PLANE_URL=http://api:8080    # Control plane location
MEDIAMTX_API_URL=http://mediamtx:9997 # MediaMTX API
PUBLIC_HLS_BASE_URL=http://...       # Public HLS endpoint
PUBLIC_WEBRTC_BASE_URL=http://...    # Public WebRTC endpoint
STREAM_SECRETS_JSON={"cam1":"rtsp://..."} # Camera credentials
```

### Edge Agent (.env)
```bash
CONTROL_PLANE_URL=http://api:8080    # Control plane location
BRANCH_ID=branch-xyz-001             # Branch identifier
CAMERA_USERNAME=admin                # ONVIF credentials
CAMERA_PASSWORD=password             # (shared for discovery)
```

### Dashboard (.env)
```bash
CONTROL_PLANE_INTERNAL_URL=http://api:8080     # API endpoint
MEDIA_GATEWAY_INTERNAL_URL=http://gateway:8090 # Media endpoint
DASHBOARD_DEMO_MODE=false            # Enable/disable demo
```

## 📊 Database Schema Overview

### Core Tables

**tenants** - Organizations
```sql
id, slug, name, created_at
```

**resource_nodes** - Hierarchical resources
```sql
id, tenant_id, parent_id, node_type, name, path (ltree)
Types: company, division, region, branch, camera-group, camera
```

**users** - System users
```sql
id, tenant_id, identity_subject, display_name, active
```

**access_grants** - Permissions
```sql
id, user_id, scope_node_id, action, effect (allow/deny)
Actions: live:view, recording:view, device:configure, etc.
```

**cameras** - Camera inventory
```sql
id, resource_node_id, branch_node_id, vendor, model,
channel, protocol, status, connection_secret_ref
```

**edge_agents** - Registered agents
```sql
id, tenant_id, branch_node_id, name, version, status
```

**camera_discoveries** - Pending approvals
```sql
id, branch_node_id, edge_agent_id, vendor, model,
ip_address, onvif_port, profiles, capabilities, status
```

**live_sessions** - Active viewing sessions
```sql
id, camera_id, user_id, token_hash, expires_at, consumed_at
```

**audit_events** - Activity log
```sql
id, tenant_id, actor_user_id, action, resource_node_id,
outcome, source_ip, occurred_at
```

## 🚦 Status Matrix

| Component | Dev | Test | Prod |
|-----------|-----|------|------|
| Control Plane API | ✅ | ✅ | ⚠️ |
| Authorization | ✅ | ✅ | ✅ |
| PostgreSQL Schema | ✅ | ✅ | ✅ |
| Edge Agent Discovery | ✅ | ✅ | ⚠️ |
| Media Gateway | ✅ | ✅ | ⚠️ |
| Dashboard | ✅ | ✅ | ⚠️ |
| ONVIF Integration | ✅ | ✅ | ✅ |
| HLS Streaming | ✅ | ✅ | ✅ |
| WebRTC/WHEP | ✅ | ⚠️ | ⚠️ |
| OIDC Auth | ❌ | ❌ | ❌ |
| mTLS (Edge) | ❌ | ❌ | ❌ |
| Secrets Manager | ❌ | ❌ | ❌ |
| Monitoring | ❌ | ❌ | ❌ |
| Backups | ❌ | ❌ | ❌ |

Legend: ✅ Ready | ⚠️ Needs hardening | ❌ Not implemented

## 💡 Key Design Decisions

### 1. Hierarchical Authorization
**Why:** Natural mapping to company→division→region→branch→camera  
**How:** PostgreSQL ltree extension for efficient path queries  
**Benefit:** Single query checks entire hierarchy

### 2. Separate Control & Media Planes
**Why:** Authorization decisions separate from stream handling  
**How:** Control plane issues tokens, media gateway handles streams  
**Benefit:** Scale independently, security isolation

### 3. On-Demand Stream Activation
**Why:** Don't proxy all 4000 cameras continuously  
**How:** MediaMTX creates path only when user requests  
**Benefit:** Minimal resource usage, instant startup

### 4. Edge-Based Discovery
**Why:** ONVIF multicast doesn't cross routers  
**How:** Agent runs on branch LAN, discovers cameras locally  
**Benefit:** Works with air-gapped networks

### 5. Default-Deny Security
**Why:** Safest authorization model  
**How:** Explicit grants required, deny overrides allow  
**Benefit:** Minimize exposure from misconfiguration

### 6. Audit Everything
**Why:** Compliance, forensics, debugging  
**How:** Async writes to audit_events table  
**Benefit:** Complete activity trail

## 📈 Scale Targets

| Metric | Target | Current Status |
|--------|--------|----------------|
| Branches | 500 | Architecture supports ✅ |
| Cameras | 4,000 | Schema designed for it ✅ |
| Concurrent viewers | 100 | Needs load testing ⚠️ |
| Live sessions/sec | 10 | Needs optimization ⚠️ |
| Authorization checks | 1000/sec | Needs caching ⚠️ |
| Database size | 100GB | Needs partitioning ⚠️ |

## 🔒 Security Model

### Authentication Layers
1. **Users** → OIDC tokens (planned)
2. **Edge Agents** → mTLS certificates (planned)
3. **Media Gateway** → Shared key (implemented)
4. **Media Paths** → Scoped bearer tokens (implemented)

### Authorization Model
```
Default: DENY
├─> Check applicable grants (by hierarchy)
├─> Any deny? → DENY
├─> Any allow? → ALLOW
└─> Default → DENY
```

### Token Lifecycle
```
1. User authenticated (OIDC)
2. Requests live view
3. Control plane checks permission
4. Issues 60-second token
5. Stores SHA-256 hash only
6. User exchanges with media gateway
7. Token marked consumed (one-time use)
8. Media gateway issues path-scoped token
9. MediaMTX validates on every segment request
10. Tokens expire → paths deleted
```

## 🎓 Learning Path

1. **Understanding Architecture** (30 min)
   - Read: docs/architecture.md
   - Review: This document

2. **Local Testing** (1 hour)
   - Follow: QUICK_START_2_CAMERAS.md
   - Explore: Dashboard UI
   - Check: PostgreSQL schema

3. **Code Deep Dive** (2 hours)
   - Study: src/domain/authorization.ts
   - Trace: Live session flow
   - Review: ONVIF discovery

4. **Deployment** (2-4 hours)
   - Follow: DEPLOYMENT_OPTIONS.md
   - Complete: CRITICAL_FIXES_CHECKLIST.md
   - Deploy: Staging environment

5. **Production Hardening** (1 week)
   - Implement: OIDC authentication
   - Add: Monitoring & alerting
   - Test: Load & failure scenarios
   - Document: Runbooks

## 🎯 Next Actions

**For First-Time Users:**
1. Run: `.\deploy\one-click-deploy.ps1` (option 4)
2. Test with your cameras
3. Explore the UI

**For Developers:**
1. Read: src/app.ts and src/domain/authorization.ts
2. Run: npm test
3. Try: Adding a new endpoint

**For DevOps:**
1. Review: DEPLOYMENT_OPTIONS.md
2. Choose: Cloud platform
3. Complete: CRITICAL_FIXES_CHECKLIST.md

**For Management:**
1. Read: EXECUTIVE_SUMMARY.md
2. Review: PRODUCTION_READINESS_GAPS.md
3. Decide: Timeline & resources

## 📞 Support Resources

- **Setup Help:** GETTING_STARTED.md
- **Camera Issues:** QUICK_START_2_CAMERAS.md (Troubleshooting section)
- **Deployment:** DEPLOYMENT_OPTIONS.md
- **Security:** PRODUCTION_READINESS_GAPS.md
- **Architecture:** docs/architecture.md

---

**Ready to start?** → [START_HERE.md](START_HERE.md)
