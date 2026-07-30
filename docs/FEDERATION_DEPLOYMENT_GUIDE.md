# Federation System Deployment Guide

## Prerequisites

### Infrastructure Requirements

**Global Command Center**:
- CPU: 16 cores minimum, 32 cores recommended
- RAM: 64 GB minimum, 128 GB recommended
- Storage: 2 TB SSD for database and cache
- Network: 10 Gbps uplink, public IP address
- OS: Ubuntu 22.04 LTS or Windows Server 2022

**Regional Control Centers** (per server):
- CPU: 8 cores minimum, 16 cores recommended
- RAM: 32 GB minimum, 64 GB recommended
- Storage: 500 GB SSD + 10-50 TB HDD for recordings
- Network: 1 Gbps uplink, dedicated inter-server link
- OS: Ubuntu 22.04 LTS or Windows Server 2022

### Software Requirements

- Node.js 20.x or later
- PostgreSQL 17 or later
- Redis 7.x or later (for caching)
- Docker 24.x (optional but recommended)
- SSL certificates for all servers

### Network Requirements

**Firewall Rules**:
```
Global Command Center:
- Inbound: 443 (HTTPS), 8080 (API)
- Outbound: All regional servers on port 443, 8080

Regional Control Centers:
- Inbound: 443 (HTTPS), 8080 (API), 1935 (RTMP)
- Outbound: GCC on port 443, 8080
- Outbound: Other regional servers on port 443, 8080

Inter-server Communication:
- Dedicated VLAN or VPN tunnel
- Minimum 100 Mbps bandwidth per server pair
- Maximum 50ms latency
```

## Deployment Steps

### Step 1: Deploy Global Command Center

```bash
# Clone repository
git clone https://github.com/your-org/sentinel-grid.git
cd sentinel-grid

# Install dependencies
npm install

# Configure environment
cp .env.example .env.gcc

# Edit .env.gcc
nano .env.gcc
```

**Environment Configuration (.env.gcc)**:
```env
# Database
DATABASE_URL=postgresql://sentinel:password@localhost:5432/sentinel_gcc

# Federation
FEDERATION_ROLE=global_command_center
FEDERATION_EXTERNAL_ID=gcc-main
FEDERATION_REGION=global
FEDERATION_JWT_SECRET=<generate-secure-secret>

# API
HOST=0.0.0.0
PORT=8080
PUBLIC_BASE_URL=https://gcc.example.com

# Authentication
AUTH_MODE=production
SESSION_SECRET=<generate-secure-secret>

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
```

```bash
# Run database migrations
npm run db:migrate

# Start services
npm run start:gcc

# Or with Docker
docker-compose -f docker-compose.gcc.yml up -d
```

### Step 2: Deploy Regional Control Centers

**For each regional server**, repeat:

```bash
# Clone on regional server
git clone https://github.com/your-org/sentinel-grid.git
cd sentinel-grid

# Install dependencies
npm install

# Configure environment
cp .env.example .env.south

# Edit .env.south
nano .env.south
```

**Environment Configuration (.env.south)**:
```env
# Database
DATABASE_URL=postgresql://sentinel:password@localhost:5432/sentinel_south

# Federation
FEDERATION_ROLE=regional_control_center
FEDERATION_EXTERNAL_ID=south-region-01
FEDERATION_REGION=south
FEDERATION_COUNTRY_CODE=IN
FEDERATION_TIMEZONE=Asia/Kolkata
FEDERATION_JWT_SECRET=<same-as-gcc>

# Global Command Center
FEDERATION_GCC_URL=https://gcc.example.com
FEDERATION_GCC_API_KEY=<shared-secret>

# API
HOST=0.0.0.0
PORT=8080
PUBLIC_BASE_URL=https://south.example.com

# Recording Storage
RECORDING_ROOT=/mnt/recordings
STORAGE_NODE_EXTERNAL_ID=south-storage-01
STORAGE_CAPACITY_GB=50000

# Sync Settings
SYNC_ENABLED=true
SYNC_INTERVAL_SECONDS=60
```

```bash
# Run database migrations
npm run db:migrate

# Start services
npm run start:regional

# Or with Docker
docker-compose -f docker-compose.regional.yml up -d
```

### Step 3: Register Regional Servers with GCC

From GCC server or via API:

```bash
# Register South Region server
curl -X POST https://gcc.example.com/api/v1/federation/servers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <gcc-admin-token>" \
  -d '{
    "externalId": "south-region-01",
    "name": "South Region Control Center",
    "role": "regional_control_center",
    "countryCode": "IN",
    "region": "south",
    "timezone": "Asia/Kolkata",
    "baseUrl": "https://south.example.com",
    "apiUrl": "https://south.example.com/api",
    "websocketUrl": "wss://south.example.com/ws",
    "sharedSecret": "<generate-secure-secret>",
    "metadata": {
      "location": "Bangalore, Karnataka",
      "contact": "ops-south@example.com"
    }
  }'

# Repeat for each regional server (north, west, east)
```

### Step 4: Configure SSL/TLS

**Using Let's Encrypt (Recommended)**:

```bash
# Install certbot
sudo apt-get install certbot

# Generate certificate for GCC
sudo certbot certonly --standalone \
  -d gcc.example.com \
  --email ops@example.com \
  --agree-tos

# Generate certificate for Regional Server
sudo certbot certonly --standalone \
  -d south.example.com \
  --email ops-south@example.com \
  --agree-tos

# Configure nginx reverse proxy
sudo nano /etc/nginx/sites-available/sentinel-gcc
```

**Nginx Configuration**:
```nginx
server {
    listen 443 ssl http2;
    server_name gcc.example.com;

    ssl_certificate /etc/letsencrypt/live/gcc.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gcc.example.com/privkey.pem;
    ssl_protocols TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Step 5: Configure Resource Mappings

Map organizational hierarchy to regional servers:

```sql
-- Connect to GCC database
psql -U sentinel sentinel_gcc

-- Map branches to regional servers
INSERT INTO regional_server_mappings (
  tenant_id,
  server_id,
  scope_node_id,
  is_primary
)
SELECT 
  '<tenant-id>'::uuid,
  '<south-server-id>'::uuid,
  rn.id,
  true
FROM resource_nodes rn
WHERE rn.node_type = 'branch'
  AND rn.name LIKE 'Karnataka%'
  OR rn.name LIKE 'Tamil Nadu%'
  OR rn.name LIKE 'Kerala%';

-- Verify mappings
SELECT 
  fs.name as server_name,
  rn.name as branch_name,
  rn.node_type
FROM regional_server_mappings rsm
JOIN federated_servers fs ON fs.id = rsm.server_id
JOIN resource_nodes rn ON rn.id = rsm.scope_node_id
ORDER BY fs.name, rn.name;
```

### Step 6: Enable Sync Jobs

```bash
# Schedule initial full sync
curl -X POST https://gcc.example.com/api/v1/federation/sync/schedule \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "sourceServerId": "<gcc-server-id>",
    "destinationServerId": "<south-server-id>",
    "entityType": "cameras",
    "syncType": "full"
  }'

# Enable incremental sync (automatic)
# This is configured in .env.south with:
# SYNC_ENABLED=true
# SYNC_INTERVAL_SECONDS=60
```

### Step 7: Verify Deployment

**Health Check**:
```bash
# Check GCC
curl https://gcc.example.com/api/health

# Check Regional Server
curl https://south.example.com/api/health

# Check Federation Status
curl https://gcc.example.com/api/v1/federation/servers \
  -H "Authorization: Bearer <admin-token>"
```

**Test Cross-Server Search**:
```bash
curl -X POST https://gcc.example.com/api/v1/federation/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "queryType": "vehicle",
    "timeRange": {
      "from": "2024-01-01T00:00:00Z",
      "to": "2024-01-31T23:59:59Z"
    },
    "filters": {
      "vehiclePlate": "KA01AB1234"
    }
  }'
```

## Disaster Recovery Setup

### Step 1: Deploy Backup Server

```bash
# Deploy backup server with same configuration as primary
# Use environment:
FEDERATION_ROLE=backup_server
FEDERATION_PRIMARY_SERVER_ID=<south-server-id>
FEDERATION_AUTO_FAILOVER_ENABLED=true
```

### Step 2: Configure Replication

```sql
-- Enable backup server
UPDATE federated_servers
SET backup_server_id = '<backup-server-id>'
WHERE id = '<primary-server-id>';

-- Configure replication
INSERT INTO federation_sync_jobs (
  tenant_id,
  source_server_id,
  destination_server_id,
  sync_type,
  entity_type
) VALUES
  ('<tenant-id>'::uuid, '<primary-id>'::uuid, '<backup-id>'::uuid, 'realtime', 'cameras'),
  ('<tenant-id>'::uuid, '<primary-id>'::uuid, '<backup-id>'::uuid, 'realtime', 'recordings');
```

### Step 3: Test Failover

```bash
# Simulate primary server failure
docker stop sentinel-south

# Monitor failover (should happen within 30 seconds)
watch -n 1 'curl https://gcc.example.com/api/v1/federation/servers/<primary-id>'

# Verify backup server is promoted
curl https://gcc.example.com/api/v1/federation/dashboard

# Restore primary server
docker start sentinel-south
```

## Multi-Country Deployment

### Additional Configuration for Different Countries

**UAE Server (.env.uae)**:
```env
FEDERATION_REGION=uae
FEDERATION_COUNTRY_CODE=AE
FEDERATION_TIMEZONE=Asia/Dubai
FEDERATION_LOCALE=ar-AE
FEDERATION_CURRENCY=AED

# Data residency
DATA_RESIDENCY_COUNTRY=AE
DATA_EXPORT_RESTRICTED=true

# Compliance
GDPR_ENABLED=false
LOCAL_DATA_PROTECTION_LAW=UAE_PDPL
```

**Singapore Server (.env.sg)**:
```env
FEDERATION_REGION=singapore
FEDERATION_COUNTRY_CODE=SG
FEDERATION_TIMEZONE=Asia/Singapore
FEDERATION_LOCALE=en-SG
FEDERATION_CURRENCY=SGD

# Data residency
DATA_RESIDENCY_COUNTRY=SG
DATA_EXPORT_RESTRICTED=true

# Compliance
GDPR_ENABLED=false
PDPA_ENABLED=true
```

## Monitoring Setup

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'gcc'
    static_configs:
      - targets: ['gcc.example.com:9090']
    metrics_path: /metrics
    
  - job_name: 'regional-servers'
    static_configs:
      - targets:
        - 'south.example.com:9090'
        - 'north.example.com:9090'
        - 'west.example.com:9090'
        - 'east.example.com:9090'
```

### Grafana Dashboards

Import pre-built dashboards:

```bash
# Import Federation Dashboard
curl -X POST http://grafana:3000/api/dashboards/import \
  -H "Content-Type: application/json" \
  -d @grafana/federation-dashboard.json
```

### Alert Rules

```yaml
# alerts.yml
groups:
  - name: federation
    interval: 30s
    rules:
      - alert: ServerOffline
        expr: federation_server_status == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Server {{ $labels.server_name }} is offline"
          
      - alert: HighReplicationLag
        expr: federation_replication_lag_seconds > 300
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High replication lag between servers"
          
      - alert: CircuitBreakerOpen
        expr: federation_circuit_breaker_open == 1
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "Circuit breaker open for {{ $labels.server_name }}"
```

## Maintenance

### Database Backups

```bash
# Automated backup script
#!/bin/bash

# Backup GCC database
pg_dump -U sentinel sentinel_gcc | \
  gzip > /backups/gcc_$(date +%Y%m%d_%H%M%S).sql.gz

# Backup Regional databases
pg_dump -U sentinel sentinel_south | \
  gzip > /backups/south_$(date +%Y%m%d_%H%M%S).sql.gz

# Upload to S3
aws s3 cp /backups/ s3://sentinel-backups/databases/ --recursive

# Keep last 30 days
find /backups -name "*.sql.gz" -mtime +30 -delete
```

### Certificate Renewal

```bash
# Automate with cron
0 0 1 * * certbot renew --quiet && systemctl reload nginx
```

### Log Rotation

```
# /etc/logrotate.d/sentinel
/var/log/sentinel/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 sentinel sentinel
    sharedscripts
    postrotate
        systemctl reload sentinel
    endscript
}
```

## Troubleshooting

### Server Not Appearing in Dashboard

1. Check server is running: `systemctl status sentinel`
2. Verify heartbeat: `tail -f /var/log/sentinel/app.log | grep heartbeat`
3. Check network connectivity: `ping gcc.example.com`
4. Verify shared secret matches
5. Check firewall rules

### Replication Lag

1. Check network bandwidth: `iftop -i eth0`
2. Review sync jobs: Query `federation_sync_jobs` table
3. Increase worker count in `.env`
4. Check database performance

### Search Results Missing

1. Verify all servers are online
2. Check circuit breaker status
3. Review timeout settings
4. Clear search cache
5. Check server logs for errors

## Performance Tuning

### Database Optimization

```sql
-- Create additional indexes for federation tables
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_federated_servers_region_status 
  ON federated_servers (region, status) WHERE status IN ('online', 'degraded');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_global_user_sessions_expiry 
  ON global_user_sessions (expires_at) WHERE revoked_at IS NULL;

-- Increase connection pool
ALTER SYSTEM SET max_connections = 500;
ALTER SYSTEM SET shared_buffers = '16GB';
```

### Caching Configuration

```env
# Enable Redis caching
REDIS_URL=redis://localhost:6379
CACHE_TTL_SECONDS=300
FEDERATION_CACHE_ENABLED=true
```

## Scaling Considerations

### Horizontal Scaling

- Deploy multiple GCC instances behind load balancer
- Use shared PostgreSQL cluster (Patroni + pgBouncer)
- Deploy Redis cluster for distributed caching
- Use message queue (RabbitMQ/Kafka) for async operations

### Vertical Scaling

- Increase server resources as camera count grows
- Scale storage independently with NAS/SAN
- Use dedicated database server for large deployments

## Security Hardening

1. Enable firewall on all servers
2. Use VPN for inter-server communication
3. Implement rate limiting on APIs
4. Enable audit logging
5. Regular security updates
6. Implement network segmentation
7. Use secrets management (HashiCorp Vault)
8. Enable 2FA for admin accounts

## Conclusion

Following this guide will result in a production-ready federated VMS deployment capable of managing thousands of cameras across multiple regions with high availability and disaster recovery.

For support, contact: federation-support@example.com
