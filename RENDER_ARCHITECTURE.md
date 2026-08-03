# Render Deployment Architecture

## System Architecture on Render

```
┌─────────────────────────────────────────────────────────────────────┐
│                          RENDER CLOUD                                │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │         Sentinel Analytics Engine (Web Service)            │    │
│  │                                                              │    │
│  │  ┌──────────────────────────────────────────────────┐      │    │
│  │  │           Node.js 20 Runtime                     │      │    │
│  │  │                                                   │      │    │
│  │  │  ┌─────────────────────────────────────┐        │      │    │
│  │  │  │    Analytics Pipeline               │        │      │    │
│  │  │  │                                      │        │      │    │
│  │  │  │  ┌──────────────────────────┐       │        │      │    │
│  │  │  │  │   Core AI Detectors      │       │        │      │    │
│  │  │  │  │  - Person Detection      │       │        │      │    │
│  │  │  │  │  - Vehicle Detection     │       │        │      │    │
│  │  │  │  │  - Face Detection        │       │        │      │    │
│  │  │  │  │  - ANPR                  │       │        │      │    │
│  │  │  │  │  - Safety Analytics      │       │        │      │    │
│  │  │  │  └──────────────────────────┘       │        │      │    │
│  │  │  │                                      │        │      │    │
│  │  │  │  ┌──────────────────────────┐       │        │      │    │
│  │  │  │  │  Analog Camera AI ⭐      │       │        │      │    │
│  │  │  │  │  - Video Quality         │       │        │      │    │
│  │  │  │  │  - Camera Aging          │       │        │      │    │
│  │  │  │  │  - Type Classifier       │       │        │      │    │
│  │  │  │  │  - DVR Health            │       │        │      │    │
│  │  │  │  │  - Upgrade Advisor       │       │        │      │    │
│  │  │  │  └──────────────────────────┘       │        │      │    │
│  │  │  └─────────────────────────────────────┘        │      │    │
│  │  │                                                   │      │    │
│  │  │  ┌─────────────────────────────────────┐        │      │    │
│  │  │  │         REST API Layer              │        │      │    │
│  │  │  │  - Detection APIs                   │        │      │    │
│  │  │  │  - Advanced Analytics APIs          │        │      │    │
│  │  │  │  - Analog Camera APIs               │        │      │    │
│  │  │  └─────────────────────────────────────┘        │      │    │
│  │  └──────────────────────────────────────────────────┘      │    │
│  │                                                              │    │
│  │  Instance: Starter/Standard/Pro                             │    │
│  │  RAM: 512MB - 16GB                                          │    │
│  │  CPU: 0.5 - 8 cores                                         │    │
│  │  Port: 3000                                                 │    │
│  └────────────────────────────────────────────────────────────┘    │
│                           │                                          │
│                           │ HTTPS                                    │
│                           ▼                                          │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │              Load Balancer (Automatic)                     │    │
│  │  - SSL/TLS Termination (Let's Encrypt)                     │    │
│  │  - Health Checks (/health)                                 │    │
│  │  - Auto-restart on failures                                │    │
│  └────────────────────────────────────────────────────────────┘    │
│                           │                                          │
└───────────────────────────┼──────────────────────────────────────────┘
                            │
                            │ Public Internet
                            ▼
            https://sentinel-analytics-engine.onrender.com
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
   ┌─────────┐         ┌─────────┐       ┌─────────┐
   │ DVR/XVR │         │  Mobile │       │   Web   │
   │ Systems │         │   App   │       │Dashboard│
   │         │         │         │       │         │
   │ RTSP →  │         │ REST →  │       │ REST →  │
   └─────────┘         └─────────┘       └─────────┘
        │                                       │
        │ Analog Cameras                       │ Users/Admin
        ▼                                       ▼
   ┌─────────┐                           ┌─────────┐
   │ Camera 1│                           │ Browser │
   │ Camera 2│                           │  iOS    │
   │ Camera N│                           │ Android │
   └─────────┘                           └─────────┘
```

## Data Flow

### 1. Camera Stream Processing
```
Analog Camera → DVR → RTSP Stream → Analytics Engine → AI Detection → Events
```

### 2. API Request Flow
```
Client → HTTPS → Render Load Balancer → Analytics Engine → Response
```

### 3. Analog AI Processing
```
Frame → Quality Detector → Metrics
     → Aging Detector → Health Score
     → Type Classifier → Camera Type
     → DVR Health → Channel Status
     → Upgrade Advisor → Recommendations
```

## Optional Add-ons

### With PostgreSQL Database
```
┌──────────────────────────────────┐
│  Analytics Engine (Web Service)  │
│            ↕                      │
│  ┌──────────────────────┐        │
│  │   PostgreSQL DB      │        │
│  │  - Historical data   │        │
│  │  - Camera metadata   │        │
│  │  - Aging history     │        │
│  └──────────────────────┘        │
└──────────────────────────────────┘
```

### With Redis Cache
```
┌──────────────────────────────────┐
│  Analytics Engine (Web Service)  │
│            ↕                      │
│  ┌──────────────────────┐        │
│  │      Redis Cache     │        │
│  │  - Real-time metrics │        │
│  │  - Session data      │        │
│  │  - API cache         │        │
│  └──────────────────────┘        │
└──────────────────────────────────┘
```

### With Persistent Disk (Models)
```
┌──────────────────────────────────┐
│  Analytics Engine (Web Service)  │
│            ↕                      │
│  ┌──────────────────────┐        │
│  │  Persistent Disk     │        │
│  │  /models/            │        │
│  │  - yolov8n.onnx      │        │
│  │  - face-model.onnx   │        │
│  │  - Other models      │        │
│  └──────────────────────┘        │
│  Size: 10GB              │        │
└──────────────────────────────────┘
```

## Horizontal Scaling (Pro Plan)

```
                    ┌─────────────────┐
                    │  Load Balancer  │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │ Instance 1 │  │ Instance 2 │  │ Instance 3 │
     │  (Node.js) │  │  (Node.js) │  │  (Node.js) │
     └────────────┘  └────────────┘  └────────────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                    ┌────────▼─────────┐
                    │ Shared Database  │
                    │  (PostgreSQL)    │
                    └──────────────────┘
```

## Multi-Region Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                    Global Traffic Manager                    │
│                    (Cloudflare / Route53)                   │
└────────────┬────────────────────────────┬───────────────────┘
             │                            │
             ▼                            ▼
    ┌────────────────┐          ┌────────────────┐
    │  US-West       │          │  Asia-Pacific  │
    │  (Oregon)      │          │  (Singapore)   │
    │                │          │                │
    │  Analytics     │          │  Analytics     │
    │  Engine        │          │  Engine        │
    └────────────────┘          └────────────────┘
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Internet (Public)                     │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS (TLS 1.3)
                         ▼
            ┌────────────────────────┐
            │   Render Load Balancer │
            │  - DDoS Protection     │
            │  - SSL Termination     │
            └───────────┬────────────┘
                        │
                        │ API Key Check
                        ▼
            ┌────────────────────────┐
            │  Analytics Engine      │
            │  - Header validation   │
            │  - Rate limiting       │
            │  - Input sanitization  │
            └────────────────────────┘
                        │
                        │ Internal Network
                        ▼
            ┌────────────────────────┐
            │  Database / Redis      │
            │  (Private Network)     │
            └────────────────────────┘
```

## Monitoring & Logging

```
┌─────────────────────────────────────┐
│      Analytics Engine               │
│                                     │
│  ┌──────────────────────────┐      │
│  │  Application Logs        │──────┼──→ Render Logs Dashboard
│  │  - Info / Warn / Error   │      │
│  └──────────────────────────┘      │
│                                     │
│  ┌──────────────────────────┐      │
│  │  Metrics                 │──────┼──→ Render Metrics
│  │  - CPU / Memory          │      │    - Real-time graphs
│  │  - Request Rate          │      │    - Alerts
│  │  - Response Time         │      │
│  └──────────────────────────┘      │
│                                     │
│  ┌──────────────────────────┐      │
│  │  Health Checks           │──────┼──→ Automatic Restarts
│  │  - /health endpoint      │      │    - Uptime monitoring
│  └──────────────────────────┘      │
└─────────────────────────────────────┘
```

## Cost Breakdown

### Starter Plan ($7/month)
```
┌─────────────────────────┐
│  Web Service: $7        │
│  - 512 MB RAM           │
│  - 0.5 CPU              │
│  - SSL included         │
│  - Autoscaling: No      │
└─────────────────────────┘
Total: $7/month
Suitable for: < 10 cameras
```

### Standard Plan ($25/month)
```
┌─────────────────────────┐
│  Web Service: $25       │
│  - 2 GB RAM             │
│  - 1 CPU                │
│  - SSL included         │
│  - Autoscaling: No      │
└─────────────────────────┘
Total: $25/month
Suitable for: 10-50 cameras
```

### Pro Plan with Database ($92/month)
```
┌─────────────────────────┐
│  Web Service: $85       │
│  - 4 GB RAM             │
│  - 2 CPU                │
│  - SSL included         │
│  - Autoscaling: Yes     │
├─────────────────────────┤
│  PostgreSQL: $7         │
│  - 256 MB RAM           │
│  - 1 GB storage         │
└─────────────────────────┘
Total: $92/month
Suitable for: 50-200 cameras
```

## High Availability Setup

```
┌──────────────────────────────────────────────────────────┐
│                   Production Setup                        │
│                                                           │
│  ┌─────────────────────────────────────────────┐         │
│  │  Primary Region (US-West)                   │         │
│  │  ┌─────────────────┐  ┌──────────────────┐ │         │
│  │  │ Analytics Engine│  │  PostgreSQL DB   │ │         │
│  │  │ (2 instances)   │  │  (Primary)       │ │         │
│  │  └─────────────────┘  └──────────────────┘ │         │
│  │          │                     │            │         │
│  │          │    Replication      │            │         │
│  │          │         ↓           │            │         │
│  └──────────┼─────────────────────┼────────────┘         │
│             │                     │                       │
│  ┌──────────┼─────────────────────┼────────────┐         │
│  │  Backup Region (US-East)       │            │         │
│  │  ┌─────────────────┐  ┌────────▼─────────┐ │         │
│  │  │ Analytics Engine│  │  PostgreSQL DB   │ │         │
│  │  │ (Standby)       │  │  (Replica)       │ │         │
│  │  └─────────────────┘  └──────────────────┘ │         │
│  └─────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────┘
```

## Backup Strategy

```
┌────────────────────────────────────┐
│  Automated Backups                 │
│                                    │
│  Database:                         │
│  - Daily snapshots (Render)        │
│  - 7-day retention                 │
│  - Point-in-time recovery          │
│                                    │
│  Persistent Disk:                  │
│  - Weekly backups                  │
│  - 30-day retention                │
│                                    │
│  Configuration:                    │
│  - Environment variables           │
│  - render.yaml in Git              │
└────────────────────────────────────┘
```

## Development to Production Pipeline

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│   Dev    │────▶│ Staging  │────▶│   Prod   │
│ (Local)  │     │ (Render) │     │ (Render) │
└──────────┘     └──────────┘     └──────────┘
     │                │                 │
     │                │                 │
     ▼                ▼                 ▼
  Feature         Integration      Live Traffic
  Testing           Testing          50+ Cameras
```

---

**Architecture Version**: 1.0
**Last Updated**: August 2, 2026
**Platform**: Render.com
