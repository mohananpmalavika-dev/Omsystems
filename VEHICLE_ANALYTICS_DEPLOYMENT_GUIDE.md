# Vehicle Analytics & ANPR - Production Deployment Guide

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ or 20+
- PostgreSQL 14+
- PaddleOCR service (optional for testing with mock)
- Docker & Docker Compose (recommended)

### Installation

1. **Install dependencies:**
```bash
cd analytics-engine
npm install
```

2. **Set up database:**
```bash
# Create database
createdb vms

# Run migrations
psql vms < analytics-engine/src/vehicle/persistence/postgres-vehicle-event.repository.ts
```

3. **Configure environment:**
```bash
cp .env.example .env

# Edit .env
DATABASE_URL=postgresql://user:password@localhost:5432/vms
PADDLE_OCR_URL=http://localhost:8000
ANPR_ENABLED=true
ANPR_COUNTRY_CODE=IN
ANPR_MIN_CONFIDENCE=0.7
```

4. **Start services:**
```bash
# Option 1: Docker Compose
docker-compose up -d

# Option 2: Manual
npm run build
npm start
```

## 📦 Docker Deployment

### docker-compose.yml
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: vms
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
  
  ocr-service:
    image: paddlepaddle/paddleocr:latest
    ports:
      - "8000:8000"
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]  # Remove if no GPU
  
  analytics-engine:
    build: ./analytics-engine
    environment:
      DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@postgres:5432/vms
      PADDLE_OCR_URL: http://ocr-service:8000
      ANPR_ENABLED: "true"
      ANPR_COUNTRY_CODE: "IN"
    depends_on:
      - postgres
      - ocr-service
    ports:
      - "3000:3000"
  
  frontend:
    build: ./
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3000
    depends_on:
      - analytics-engine
    ports:
      - "8080:8080"

volumes:
  postgres-data:
```

### Start Services
```bash
docker-compose up -d
```

## 🔧 Configuration

### Per-Camera Configuration

Create `config/cameras.json`:
```json
{
  "cameras": [
    {
      "cameraId": "gate_entrance",
      "tenantId": "tenant-123",
      "siteId": "site-456",
      "config": {
        "minVehicleConfidence": 0.5,
        "minPlateConfidence": 0.7,
        "minOcrConfidence": 0.8,
        "minPlateWidth": 40,
        "minBlurScore": 0.55,
        "maxOcrPerSecond": 5,
        "trackTimeout": 5000,
        "countryCode": "IN",
        "enableAnpr": true,
        "enableColorClassification": true,
        "enableWatchlist": true
      }
    }
  ]
}
```

### Watchlist Configuration

Load watchlist entries via API or database:
```typescript
await watchlistService.loadWatchlist('tenant-123', [
  {
    id: 'watch-1',
    tenantId: 'tenant-123',
    normalizedPlate: 'KL01AB1234',
    reason: 'Stolen vehicle',
    severity: 'critical',
    category: 'stolen',
    enabled: true,
    createdAt: new Date(),
  }
]);
```

### Camera Topology

Set up camera topology for journey validation:
```typescript
journeyService.setTopology({
  cameras: new Map([
    ['gate_entrance', {
      cameraId: 'gate_entrance',
      cameraName: 'Main Gate',
      siteId: 'site-456',
      siteName: 'HQ',
      location: { latitude: 12.9716, longitude: 77.5946 }
    }],
    ['parking_entrance', {
      cameraId: 'parking_entrance',
      cameraName: 'Parking',
      siteId: 'site-456',
      siteName: 'HQ',
      location: { latitude: 12.9720, longitude: 77.5950 }
    }]
  ]),
  connections: [
    {
      fromCameraId: 'gate_entrance',
      toCameraId: 'parking_entrance',
      distance: 150,
      typicalTransitTime: 60
    }
  ]
});
```

## 📊 Monitoring

### Prometheus Metrics

Expose metrics endpoint:
```typescript
import express from 'express';
import { VehicleAnalyticsMetrics, InMemoryMetricsCollector } from './vehicle/index.js';

const app = express();
const collector = new InMemoryMetricsCollector();

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(collector.exportPrometheus());
});

app.listen(9090);
```

### Grafana Dashboard

Import dashboard template from `monitoring/grafana-dashboard.json`:
- Vehicle detection rate
- ANPR recognition success rate
- OCR latency
- Plate quality scores
- Watchlist matches
- Active tracks per camera

### Key Metrics to Monitor

```
anpr_recognition_success_rate < 0.7  # Alert if below 70%
anpr_ocr_latency_ms > 1000           # Alert if OCR too slow
vehicle_events_persisted_total       # Track throughput
watchlist_matches_total{severity="critical"}  # Immediate alerts
camera_anpr_readiness_score < 0.5    # Camera quality issues
```

## 🔐 Security

### API Authentication

All endpoints require authentication:
```typescript
router.use(authenticate);
router.use(authorize(['vehicle-analytics:read']));
```

### Watchlist Access Control

Restrict watchlist operations:
```typescript
router.post('/watchlist', 
  authorize(['vehicle-analytics:watchlist:write']),
  async (req, res) => { /* ... */ }
);
```

### Data Encryption

- Database encryption at rest
- TLS for OCR service communication
- Snapshot URIs with signed URLs

## 🧪 Testing

### Run Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### Load Testing
```bash
# Simulate 20 cameras at 25 FPS
npm run load-test -- --cameras=20 --fps=25 --duration=60
```

## 📈 Performance Tuning

### Database Optimization

```sql
-- Analyze query performance
EXPLAIN ANALYZE
SELECT * FROM vehicle_events
WHERE tenant_id = 'tenant-123'
  AND normalized_plate = 'KL01AB1234'
  AND occurred_at >= NOW() - INTERVAL '7 days';

-- Add missing indexes if needed
CREATE INDEX CONCURRENTLY idx_custom 
ON vehicle_events (custom_field);

-- Vacuum regularly
VACUUM ANALYZE vehicle_events;
```

### OCR Service Scaling

```yaml
# Scale OCR workers
ocr-service:
  deploy:
    replicas: 3
  environment:
    WORKERS: 4
```

### Camera Load Balancing

Distribute cameras across analytics instances:
```
Instance 1: cameras 1-10
Instance 2: cameras 11-20
Instance 3: cameras 21-30
```

## 🐛 Troubleshooting

### Low Recognition Rate

1. Check camera positioning (plate width > 40px)
2. Verify lighting conditions
3. Adjust quality gates:
   ```typescript
   minPlateConfidence: 0.6,  // Lower threshold
   minOcrConfidence: 0.7,    // Lower threshold
   ```
4. Check OCR service health

### High OCR Latency

1. Scale OCR service horizontally
2. Add GPU acceleration
3. Reduce OCR budget:
   ```typescript
   maxOcrPerSecond: 3  // Reduce load
   ```

### Memory Issues

1. Reduce tracking window:
   ```typescript
   trackTimeout: 3000  // 3 seconds instead of 5
   ```
2. Clean up old events:
   ```bash
   # Delete events older than 90 days
   psql vms -c "DELETE FROM vehicle_events WHERE created_at < NOW() - INTERVAL '90 days'"
   ```

### Database Performance

1. Check index usage:
   ```sql
   SELECT * FROM pg_stat_user_indexes
   WHERE schemaname = 'public'
   AND tablename = 'vehicle_events';
   ```
2. Monitor connection pool:
   ```typescript
   pool: {
     max: 20,
     min: 5,
     idle: 10000
   }
   ```

## 📞 Support

- Documentation: `/docs`
- Issues: GitHub Issues
- Email: support@company.com

## 🔄 Upgrade Guide

### From Mock to Production OCR

1. Deploy PaddleOCR service
2. Update config:
   ```typescript
   const recognizer = new PaddlePlateRecognizer(
     process.env.PADDLE_OCR_URL
   );
   ```
3. Test recognition rate
4. Gradually enable per camera

### Database Migration

```bash
# Backup before migration
pg_dump vms > backup.sql

# Run migration
npm run migrate

# Verify
npm run verify-schema
```

## 📝 License

Proprietary - All Rights Reserved

---

**Version:** 1.0.0  
**Last Updated:** January 2025  
**Status:** Production Ready ✅
