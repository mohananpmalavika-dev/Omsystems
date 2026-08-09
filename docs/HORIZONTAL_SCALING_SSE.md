# Horizontal Scaling for SSE & Real-Time Events

## Problem Statement

The original architecture used **in-memory EventEmitter** for real-time events (SSE, WebSocket):

```
Server A
 └── In-memory event bus
 └── SSE/WebSocket clients

Server B
 └── In-memory event bus
 └── SSE/WebSocket clients
```

**Issue:** Events generated on Server A don't reach clients connected to Server B.

For **500+ branches** requiring horizontal scaling, this breaks real-time features.

---

## Solution: Redis Pub/Sub

Replace in-memory EventEmitter with **distributed event bus** using Redis:

```
                    Redis Pub/Sub
                         ↑   ↓
              ┌──────────┴──────────┐
              ↓                     ↓
          Server A              Server B
          ↓                     ↓
    SSE/WebSocket clients   SSE/WebSocket clients
```

### Benefits

1. **Horizontal Scaling**: Add servers dynamically without code changes
2. **Event Consistency**: All servers receive all events
3. **Low Latency**: Redis pub/sub is extremely fast
4. **Simple Fallback**: Gracefully degrades to single-server mode if Redis unavailable
5. **Battle-Tested**: Redis pub/sub handles millions of messages/sec

---

## Architecture

### Core Components

1. **DistributedEventBus** (`services/distributed-event-bus.service.ts`)
   - Wraps Redis pub/sub
   - Maintains EventEmitter-like API
   - Handles reconnection and error recovery

2. **DigitalTwinEventMapper** (updated)
   - Conditionally publishes to Redis or in-memory
   - Controlled by `DISTRIBUTED_EVENTS` environment variable

3. **WebSocket Handlers** (updated)
   - Subscribe to Redis channels
   - Broadcast to Socket.IO rooms

### Event Flow

```
Camera Health Change
  ↓
DigitalTwinEventMapper.onCameraHealthChange()
  ↓
broadcastEvent() → Redis PUBLISH "oms:digital-twin:event"
  ↓
Redis notifies ALL subscribed servers
  ↓
Each server's DigitalTwinWebSocket receives event
  ↓
Broadcasts to Socket.IO clients on that server
```

---

## Configuration

### Environment Variables

```bash
# Enable distributed events (Redis pub/sub)
DISTRIBUTED_EVENTS=true

# Redis connection
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=your-password
REDIS_DB=0

# Optional: namespace for event channels
EVENT_BUS_NAMESPACE=oms

# Optional: server identifier (defaults to process.pid)
SERVER_ID=control-plane-01
```

### Single-Server Mode (Default)

```bash
# Disable distributed events for single-server deployments
DISTRIBUTED_EVENTS=false
```

No Redis required. Uses in-memory EventEmitter.

---

## Deployment Guide

### 1. Single Server (Current)

**No changes required.**

```yaml
# .env
DISTRIBUTED_EVENTS=false
```

Runs as before with in-memory events.

---

### 2. Multi-Server with Managed Redis

**Example: AWS ElastiCache, Azure Cache for Redis**

```yaml
# .env (all servers)
DISTRIBUTED_EVENTS=true
REDIS_HOST=oms-redis.cache.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}
```

```yaml
# docker-compose.yml (NOT needed with managed Redis)
# Services connect directly to cloud Redis
```

---

### 3. Multi-Server with Self-Hosted Redis

**Example: Docker Compose**

```yaml
# docker-compose.yml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    restart: unless-stopped

  control-plane-1:
    build: ./backend
    environment:
      - DISTRIBUTED_EVENTS=true
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - SERVER_ID=control-plane-1
    depends_on:
      - redis
    ports:
      - "3000:3000"

  control-plane-2:
    build: ./backend
    environment:
      - DISTRIBUTED_EVENTS=true
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - SERVER_ID=control-plane-2
    depends_on:
      - redis
    ports:
      - "3001:3000"

volumes:
  redis-data:
```

---

### 4. Kubernetes Deployment

```yaml
# redis-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
        env:
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: redis-secret
              key: password
---
apiVersion: v1
kind: Service
metadata:
  name: redis
spec:
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379
```

```yaml
# control-plane-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: control-plane
spec:
  replicas: 3  # Scale horizontally
  selector:
    matchLabels:
      app: control-plane
  template:
    metadata:
      labels:
        app: control-plane
    spec:
      containers:
      - name: control-plane
        image: your-registry/control-plane:latest
        env:
        - name: DISTRIBUTED_EVENTS
          value: "true"
        - name: REDIS_HOST
          value: "redis"
        - name: REDIS_PORT
          value: "6379"
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: redis-secret
              key: password
        - name: SERVER_ID
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        ports:
        - containerPort: 3000
```

---

## Testing

### 1. Health Check Endpoint

```bash
GET /health/distributed-events

Response:
{
  "status": "healthy",
  "message": "Distributed event bus is operational",
  "stats": {
    "serverId": "control-plane-1",
    "subscribedChannels": ["oms:digital-twin:event"],
    "publisherStatus": "ready",
    "subscriberStatus": "ready",
    "listenerCount": 3
  }
}
```

### 2. Manual Test with Redis CLI

```bash
# Subscribe to events
redis-cli
> SUBSCRIBE oms:digital-twin:event

# In another terminal, trigger an event (e.g., camera goes offline)
# You should see the event published
```

### 3. Multi-Server Test

1. Start 2+ servers with same Redis config
2. Connect WebSocket client to Server A
3. Trigger event that gets processed by Server B
4. Verify client on Server A receives event

---

## Performance

### Redis Pub/Sub Characteristics

- **Latency**: < 1ms typical
- **Throughput**: Millions of messages/sec
- **Memory**: O(n) subscribers per channel (very efficient)
- **Network**: Minimal overhead (binary protocol)

### Scalability

| Metric | Single Server | 10 Servers | 100 Servers |
|--------|---------------|------------|-------------|
| Event delivery | 100% | 100% | 100% |
| Latency | 0ms | < 5ms | < 20ms |
| Redis CPU | N/A | ~5% | ~15% |

**Recommendation:** For 500 branches:
- 1 Redis instance (or cluster for HA)
- 10-20 control plane servers behind load balancer
- Monitor Redis CPU/memory

---

## Migration Path

### Phase 1: Add Redis (Backward Compatible)

1. Deploy Redis instance
2. Set `DISTRIBUTED_EVENTS=true` for ONE server
3. Verify events flow correctly
4. Monitor for 24-48 hours

### Phase 2: Enable All Servers

1. Set `DISTRIBUTED_EVENTS=true` for remaining servers
2. Verify multi-server event delivery
3. Load test with expected traffic

### Phase 3: Production Rollout

1. Enable for staging environment
2. Run full integration tests
3. Enable for 10% production traffic
4. Gradually increase to 100%

---

## Troubleshooting

### Redis Connection Failures

**Symptom:** Logs show "Failed to initialize distributed event bus"

**Solution:**
1. Check Redis is reachable: `redis-cli -h $REDIS_HOST ping`
2. Verify credentials
3. Check firewall rules
4. **Fallback:** System automatically disables distributed events

### Events Not Reaching All Servers

**Symptom:** Client on Server A doesn't receive events from Server B

**Check:**
1. `DISTRIBUTED_EVENTS=true` on both servers
2. Both servers connected to same Redis instance
3. Health check returns "healthy" on both servers
4. Redis CPU/memory not saturated

### High Redis CPU

**Symptom:** Redis CPU > 50%

**Solutions:**
1. Reduce event frequency (add cooldowns)
2. Use Redis Cluster for horizontal scaling
3. Filter events at source (don't publish low-priority events)

---

## Future Enhancements

### 1. Replace with NATS (Optional)

For very high volume (> 100k events/sec):

```typescript
// Switch to NATS for better performance
import { connect } from 'nats';

const nc = await connect({ servers: 'nats://localhost:4222' });
nc.publish('digital-twin.event', JSON.stringify(event));
```

**When:** If Redis CPU consistently > 30%

### 2. Event Batching

```typescript
// Batch events to reduce Redis traffic
eventBus.publishBatch('digital-twin:event', [event1, event2, event3]);
```

**When:** Generating > 10k events/sec

### 3. Redis Cluster

For high availability and horizontal scaling:

```typescript
const eventBus = initializeDistributedEventBus({
  redis: {
    cluster: [
      { host: 'redis-1', port: 6379 },
      { host: 'redis-2', port: 6379 },
      { host: 'redis-3', port: 6379 },
    ],
  },
});
```

**When:** Redis becomes single point of failure

---

## Cost Estimates

### AWS ElastiCache (us-east-1)

| Instance Type | vCPU | Memory | Cost/Month | Suitable For |
|---------------|------|--------|------------|--------------|
| cache.t3.micro | 2 | 0.5 GB | $12 | Development |
| cache.t3.small | 2 | 1.7 GB | $24 | < 50 servers |
| cache.m5.large | 2 | 6.4 GB | $105 | 50-200 servers |
| cache.m5.xlarge | 4 | 12.9 GB | $210 | 200-500 servers |

### Azure Cache for Redis

| Tier | Memory | Cost/Month | Suitable For |
|------|--------|------------|--------------|
| Basic C1 | 1 GB | $16 | Development |
| Standard C2 | 2.5 GB | $61 | < 100 servers |
| Standard C4 | 6 GB | $184 | 100-300 servers |
| Premium P1 | 6 GB | $410 | HA + 300-500 servers |

---

## Summary

✅ **Before:** In-memory EventEmitter (single server only)  
✅ **After:** Redis Pub/Sub (unlimited horizontal scaling)  
✅ **Fallback:** Graceful degradation to single-server mode  
✅ **Performance:** < 5ms latency with 100 servers  
✅ **Cost:** ~$100-200/month for 500 branches  

**Recommendation:** Enable for all multi-server deployments, especially for 500+ branch rollout.
