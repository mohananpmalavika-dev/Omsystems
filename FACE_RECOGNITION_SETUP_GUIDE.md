# Face Recognition Setup Guide

Complete step-by-step guide to deploy the face recognition system.

## Prerequisites

- PostgreSQL 14+ with pgvector extension
- Node.js 18+ 
- ONNX Runtime compatible hardware (CPU minimum, GPU recommended for production)
- ArcFace ONNX model file

## Step 1: Install Dependencies

### Backend Dependencies

```bash
cd analytics-engine
npm install onnxruntime-node sharp
```

### Frontend Dependencies

```bash
cd frontend
npm install react-dropzone date-fns
```

### PostgreSQL Extension

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## Step 2: Database Migration

Run the pgvector migration:

```bash
psql -U your_user -d your_database -f database/migrations/014_enable_pgvector_faces.sql
```

Verify the migration:

```sql
-- Check tables exist
\dt face_*

-- Check vector column
\d face_embeddings

-- Check indexes
\di face_embeddings_*
```

## Step 3: Obtain ArcFace Model

### Option A: Download Pre-trained Model

Download from InsightFace model zoo or similar sources:

```bash
mkdir -p analytics-engine/models/face
cd analytics-engine/models/face

# Example: Download ArcFace ResNet100 model
wget https://path-to-model/arcface-r100.onnx
```

### Option B: Convert from PyTorch

If you have a PyTorch ArcFace model:

```python
import torch
import onnx

model = torch.load('arcface.pth')
model.eval()

dummy_input = torch.randn(1, 3, 112, 112)

torch.onnx.export(
    model,
    dummy_input,
    'arcface-r100.onnx',
    export_params=True,
    opset_version=12,
    input_names=['input'],
    output_names=['output'],
    dynamic_axes={'input': {0: 'batch_size'}, 'output': {0: 'batch_size'}}
)
```

### Model Requirements

- Input shape: `[1, 3, 112, 112]` (NCHW format)
- Input type: float32, normalized to [-1, 1]
- Output shape: `[1, 512]`
- Output type: float32 (embedding vector)

## Step 4: Configure Environment

Create or update `.env`:

```env
# Face Recognition Configuration
ARCFACE_MODEL_PATH=/app/models/face/arcface-r100.onnx
FACE_DETECTOR_MODEL_PATH=/app/models/face/retinaface.onnx

# Optional: GPU acceleration
# ONNX_EXECUTION_PROVIDERS=cuda,cpu
```

## Step 5: Initialize Services

### Backend App Initialization

Add to `src/app.ts` or your main application file:

```typescript
import { Pool } from 'pg';
import { FaceRecognitionService } from '../analytics-engine/src/face/face-recognition.service.js';
import { FaceEnrollmentService } from '../analytics-engine/src/face/face-enrollment.service.js';
import { FaceWatchlistService } from './services/face-watchlist.service.js';
import { FaceTrackAggregator } from '../analytics-engine/src/face/face-track-aggregator.js';

// Database pool
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialize face recognition services
const faceRecognitionService = new FaceRecognitionService(db, {
  modelName: 'arcface-r100',
  modelVersion: '1.0.0',
  embeddingDimension: 512,
  enrollmentQualityThreshold: 0.80,
  runtimeQualityThreshold: 0.55,
});

await faceRecognitionService.initialize();

const faceEnrollmentService = new FaceEnrollmentService(
  db,
  faceRecognitionService,
  {
    maxImagesPerPerson: 10,
    minImagesPerPerson: 1,
    checkDuplicates: true,
    duplicateThreshold: 0.90,
  }
);

const faceWatchlistService = new FaceWatchlistService(
  db,
  faceEnrollmentService
);

const faceTrackAggregator = new FaceTrackAggregator(db, {
  trackExpirationSeconds: 10,
  minObservationsForAlert: 3,
  temporalWindowSeconds: 2,
});

faceTrackAggregator.start();

// Make services available
app.locals.db = db;
app.locals.faceRecognitionService = faceRecognitionService;
app.locals.faceEnrollmentService = faceEnrollmentService;
app.locals.faceWatchlistService = faceWatchlistService;
app.locals.faceTrackAggregator = faceTrackAggregator;

console.log('✓ Face recognition services initialized');
```

### Register API Routes

Add to your route registration:

```typescript
import faceWatchlistRoutes from './routes/face-watchlist.routes.js';
import faceRecognitionRoutes from './routes/face-recognition.routes.js';

app.use('/api/face-watchlists', faceWatchlistRoutes);
app.use('/api/face-recognition', faceRecognitionRoutes);
```

### Frontend Routes

Add to your React Router configuration:

```typescript
import { WatchlistManager } from './components/face-recognition/WatchlistManager';
import { PersonEnrollment } from './components/face-recognition/PersonEnrollment';
import { FaceMatchReview } from './components/face-recognition/FaceMatchReview';

<Route path="/face-recognition">
  <Route path="watchlists" element={<WatchlistManager />} />
  <Route path="watchlists/:watchlistId" element={<WatchlistDetail />} />
  <Route path="events" element={<FaceEventList />} />
  <Route path="analytics" element={<FaceAnalytics />} />
</Route>
```

## Step 6: Integrate with Analytics Pipeline

Update your camera analytics pipeline to use face recognition:

```typescript
import { FaceRecognitionService } from '../face/face-recognition.service.js';
import { FaceTrackAggregator } from '../face/face-track-aggregator.js';

// In your frame processing pipeline
async function processFrame(
  tenantId: string,
  cameraId: string,
  frameData: Buffer,
  frameWidth: number,
  frameHeight: number,
  timestamp: Date
) {
  // 1. Detect faces using your existing detector
  const faceDetections = await faceDetector.detect(frame);

  // 2. Run face recognition
  const observations = await faceRecognitionService.recognizeFrame(
    tenantId,
    frameId,
    cameraId,
    timestamp,
    frameData,
    frameWidth,
    frameHeight,
    faceDetections,
    undefined, // Optional: filter by specific watchlist IDs
  );

  // 3. Process each observation
  for (const observation of observations) {
    if (observation.recognition?.status === 'MATCH') {
      // Add to track aggregator
      const result = await faceTrackAggregator.addObservation(observation);

      // Generate alert if threshold met
      if (result.shouldAlert && result.matchEvent) {
        await emitFaceMatchAlert(result.matchEvent);
      }
    }

    // Store observation in database if needed
    await storeFaceObservation(observation);
  }
}
```

## Step 7: Create Initial Watchlists

### Via API

```bash
curl -X POST http://localhost:3000/api/face-watchlists \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Security Personnel",
    "description": "Authorized security staff",
    "listType": "staff",
    "enabled": true,
    "matchThreshold": 0.70,
    "reviewThreshold": 0.60
  }'
```

### Via SQL

```sql
INSERT INTO face_watchlists (
  tenant_id, name, description, list_type, enabled,
  alert_on_match, alert_severity, created_by
) VALUES (
  'your-tenant-id',
  'VIP Guests',
  'High-priority visitors',
  'vip',
  true,
  true,
  'P2',
  'your-user-id'
);
```

## Step 8: Enroll First Person

### Via UI

1. Navigate to Face Recognition → Watchlists
2. Click on a watchlist
3. Click "Enroll Person"
4. Enter name and upload 2-5 clear face photos
5. Submit enrollment

### Via API

```bash
curl -X POST http://localhost:3000/api/face-watchlists/WATCHLIST_ID/persons \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "displayName=John Doe" \
  -F "externalId=EMP-001" \
  -F "images=@photo1.jpg" \
  -F "images=@photo2.jpg" \
  -F "images=@photo3.jpg"
```

## Step 9: Testing

### Test Face Detection

```typescript
import { FaceRecognitionService } from './face-recognition.service.js';

// Load test image
const testImage = await fs.readFile('test-face.jpg');
const sharp = require('sharp');
const metadata = await sharp(testImage).metadata();

// Mock detection (replace with actual face detector)
const mockDetection = {
  boundingBox: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
  landmarks: {
    leftEye: { x: 0.35, y: 0.35 },
    rightEye: { x: 0.65, y: 0.35 },
    nose: { x: 0.5, y: 0.5 },
    leftMouth: { x: 0.4, y: 0.7 },
    rightMouth: { x: 0.6, y: 0.7 },
  },
  confidence: 0.95,
};

// Test recognition
const result = await faceRecognitionService.recognizeFace(
  'tenant-id',
  'frame-id',
  'camera-id',
  new Date(),
  testImage,
  metadata.width!,
  metadata.height!,
  mockDetection
);

console.log('Recognition result:', result);
```

### Test Enrollment

```typescript
const enrollmentResult = await faceEnrollmentService.enrollPerson({
  tenantId: 'tenant-id',
  watchlistId: 'watchlist-id',
  displayName: 'Test Person',
  images: [testImage1, testImage2],
  actorId: 'user-id',
});

console.log('Enrollment result:', enrollmentResult);
```

### Test Search

```typescript
const searchService = faceRecognitionService.getServices().search;

// Assuming you have an embedding
const candidates = await searchService.searchPersons({
  tenantId: 'tenant-id',
  embedding: testEmbedding,
  limit: 5,
});

console.log('Search candidates:', candidates);
```

## Step 10: Monitoring

### Health Check Endpoint

Add health check:

```typescript
app.get('/health/face-recognition', (req, res) => {
  const health = faceRecognitionService.getHealth();
  const trackStats = faceTrackAggregator.getStats();

  res.json({
    faceRecognition: health,
    trackAggregator: trackStats,
    timestamp: new Date().toISOString(),
  });
});
```

### Database Monitoring

```sql
-- Check enrollment stats
SELECT
  fw.name,
  COUNT(DISTINCT fp.id) as person_count,
  COUNT(fe.id) as embedding_count,
  AVG(fe.quality_score) as avg_quality
FROM face_watchlists fw
LEFT JOIN face_watchlist_persons fp ON fp.watchlist_id = fw.id
LEFT JOIN face_embeddings fe ON fe.person_id = fp.id
WHERE fw.tenant_id = 'your-tenant-id'
GROUP BY fw.id, fw.name;

-- Check recent matches
SELECT
  fre.occurred_at,
  fp.full_name,
  fw.name as watchlist,
  fre.similarity_score,
  c.name as camera
FROM face_recognition_events fre
JOIN face_watchlist_persons fp ON fp.id = fre.person_id
JOIN face_watchlists fw ON fw.id = fre.watchlist_id
JOIN cameras c ON c.id = fre.camera_id
WHERE fre.tenant_id = 'your-tenant-id'
ORDER BY fre.occurred_at DESC
LIMIT 20;

-- Check index performance
EXPLAIN ANALYZE
SELECT id, person_id, 1 - (embedding <=> '[...]'::vector) as similarity
FROM face_embeddings
WHERE tenant_id = 'your-tenant-id'
ORDER BY embedding <=> '[...]'::vector
LIMIT 10;
```

## Step 11: Performance Tuning

### PostgreSQL Configuration

For optimal pgvector performance:

```sql
-- Increase shared buffers
ALTER SYSTEM SET shared_buffers = '4GB';

-- Increase work memory for sorting
ALTER SYSTEM SET work_mem = '256MB';

-- Increase maintenance work memory for index building
ALTER SYSTEM SET maintenance_work_mem = '2GB';

-- Reload configuration
SELECT pg_reload_conf();
```

### HNSW Index Tuning

Adjust HNSW parameters for your workload:

```sql
-- Drop existing index
DROP INDEX IF EXISTS face_embeddings_embedding_hnsw_idx;

-- Recreate with tuned parameters
CREATE INDEX face_embeddings_embedding_hnsw_idx
ON face_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- For larger datasets (>100k embeddings), consider:
-- WITH (m = 32, ef_construction = 128);
```

### Application-Level Caching

```typescript
// Cache watchlist thresholds
const watchlistConfigCache = new Map<string, WatchlistThresholdConfig>();

async function getWatchlistConfig(watchlistId: string) {
  if (!watchlistConfigCache.has(watchlistId)) {
    const config = await loadWatchlistConfig(watchlistId);
    watchlistConfigCache.set(watchlistId, config);
    
    // Expire after 5 minutes
    setTimeout(() => watchlistConfigCache.delete(watchlistId), 5 * 60 * 1000);
  }
  
  return watchlistConfigCache.get(watchlistId);
}
```

## Step 12: Production Considerations

### GPU Acceleration

For production deployments with high volume:

```bash
# Install CUDA-enabled ONNX Runtime
npm install onnxruntime-node-gpu

# Update service configuration
const recognitionService = new FaceRecognitionService(db, {
  embeddingConfig: {
    executionProviders: ['cuda', 'cpu'], // Fallback to CPU
  },
});
```

### Horizontal Scaling

- Face recognition services are stateless and can scale horizontally
- Track aggregator state is in-memory; consider Redis for shared state
- Database connection pooling is critical

```typescript
const db = new Pool({
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Backpressure Management

Don't process every frame:

```typescript
// Sample frames intelligently
let lastFaceRecognition = 0;
const FACE_RECOGNITION_INTERVAL = 500; // ms

async function processFrame(frame) {
  const now = Date.now();
  
  if (now - lastFaceRecognition < FACE_RECOGNITION_INTERVAL) {
    return; // Skip this frame
  }
  
  lastFaceRecognition = now;
  await runFaceRecognition(frame);
}
```

### Monitoring & Alerts

Set up alerts for:
- Model loading failures
- Database connection failures
- High recognition latency (>500ms)
- Low quality matches (quality <0.3)
- High false positive rate

## Troubleshooting

### Issue: Model Not Loading

```
Error: Failed to load ONNX model
```

**Solutions:**
1. Verify file path: `ls -la $ARCFACE_MODEL_PATH`
2. Check file permissions
3. Verify model format: `python -c "import onnx; onnx.checker.check_model('model.onnx')"`

### Issue: Poor Recognition Accuracy

**Solutions:**
1. Check enrollment image quality
2. Verify face alignment is working correctly
3. Adjust thresholds per watchlist type
4. Add more enrollment images per person (3-5 recommended)
5. Review calibration data

### Issue: Slow Recognition

**Solutions:**
1. Enable GPU acceleration
2. Check HNSW index is being used: `EXPLAIN ANALYZE`
3. Reduce embedding dimension (if using custom model)
4. Implement frame sampling
5. Scale horizontally

### Issue: High Memory Usage

**Solutions:**
1. Limit active tracks in aggregator
2. Implement track expiration
3. Clear in-memory caches periodically
4. Use connection pooling efficiently

## Security Checklist

- [ ] Enable audit logging for all face operations
- [ ] Implement role-based access control (RBAC)
- [ ] Encrypt enrollment images at rest
- [ ] Use HTTPS for all API communication
- [ ] Implement rate limiting on enrollment endpoints
- [ ] Regular security audits of watchlist access
- [ ] Data retention policies configured
- [ ] GDPR compliance measures in place
- [ ] Secure model file storage
- [ ] Database backups enabled

## Next Steps

1. **Calibrate thresholds** using your actual camera footage
2. **Train operators** on enrollment best practices
3. **Set up monitoring** and alerting
4. **Plan for model upgrades** and re-embedding workflows
5. **Implement advanced features**: clustering, cross-camera tracking, liveness detection

## Support & Resources

- Documentation: `/docs/face-recognition`
- API Reference: `/api-docs`
- Model Zoo: InsightFace GitHub
- Community: Your internal Slack/Teams channel

---

**Congratulations!** Your face recognition system is now fully operational with zero paid API dependencies.
