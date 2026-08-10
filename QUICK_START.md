# Face Recognition Quick Start Guide

Follow these steps to get the face recognition system running.

## Step 1: Install Backend Dependencies

```bash
cd analytics-engine
npm install onnxruntime-node sharp

# If you have GPU (CUDA):
# npm install onnxruntime-node-gpu sharp
```

**Note**: These packages are large (~200MB). Installation may take 5-10 minutes.

## Step 2: Install Frontend Dependencies

```bash
cd ../frontend
npm install react-dropzone date-fns
```

## Step 3: Enable pgvector Extension

First, connect to your PostgreSQL database:

```bash
psql -U postgres -d your_database_name
```

Then run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
\q
```

Verify it's installed:

```bash
psql -U postgres -d your_database_name -c "SELECT * FROM pg_extension WHERE extname='vector';"
```

## Step 4: Run Database Migration

```bash
cd c:\Omsystems
psql -U postgres -d your_database_name -f database/migrations/014_enable_pgvector_faces.sql
```

Verify migration:

```bash
psql -U postgres -d your_database_name -c "\dt face_*"
psql -U postgres -d your_database_name -c "\d face_embeddings"
```

You should see:
- `face_watchlists`
- `face_watchlist_persons`
- `face_embeddings` (with `embedding vector(512)` column)
- `face_recognition_events`
- `face_match_reviews`
- `face_tracks`

## Step 5: Obtain ArcFace Model

### Option A: Download Pre-converted Model (Recommended)

Visit one of these sources:
1. **InsightFace Model Zoo**: https://github.com/deepinsight/insightface/tree/master/model_zoo
2. **ONNX Model Zoo**: https://github.com/onnx/models
3. **Hugging Face**: Search for "arcface onnx"

Download `arcface_r100_v1.onnx` or similar.

### Option B: Use Demo Script (For Testing)

Create a dummy model for testing (not for production):

```bash
cd analytics-engine/models/face
mkdir -p ../../models/face
```

Create `create_dummy_model.py`:

```python
import numpy as np
import onnx
from onnx import helper, TensorProto

# Create a simple dummy model for testing
# Input: [1, 3, 112, 112]
# Output: [1, 512]

input_tensor = helper.make_tensor_value_info('input', TensorProto.FLOAT, [1, 3, 112, 112])
output_tensor = helper.make_tensor_value_info('output', TensorProto.FLOAT, [1, 512])

# Simple identity-like operation (for testing only)
flatten_node = helper.make_node('Flatten', ['input'], ['flat'], axis=1)
weights = np.random.randn(3*112*112, 512).astype(np.float32) * 0.01
weights_tensor = helper.make_tensor('weights', TensorProto.FLOAT, [3*112*112, 512], weights.flatten())
matmul_node = helper.make_node('MatMul', ['flat', 'weights'], ['output'])

graph = helper.make_graph(
    [flatten_node, matmul_node],
    'arcface_dummy',
    [input_tensor],
    [output_tensor],
    [weights_tensor]
)

model = helper.make_model(graph, producer_name='test')
onnx.checker.check_model(model)
onnx.save(model, 'arcface-r100.onnx')
print("✓ Dummy model created (for testing only)")
```

Run:
```bash
pip install onnx numpy
python create_dummy_model.py
```

### Option C: Convert from PyTorch

If you have a PyTorch ArcFace model:

```python
import torch
import torch.onnx

# Load your model
model = torch.load('your_arcface_model.pth')
model.eval()

# Create dummy input
dummy_input = torch.randn(1, 3, 112, 112)

# Export to ONNX
torch.onnx.export(
    model,
    dummy_input,
    'arcface-r100.onnx',
    export_params=True,
    opset_version=12,
    do_constant_folding=True,
    input_names=['input'],
    output_names=['output'],
    dynamic_axes={
        'input': {0: 'batch_size'},
        'output': {0: 'batch_size'}
    }
)
print("✓ Model exported to ONNX")
```

### Verify Model

```python
import onnx

model = onnx.load('arcface-r100.onnx')
onnx.checker.check_model(model)

print("Input name:", model.graph.input[0].name)
print("Input shape:", [d.dim_value for d in model.graph.input[0].type.tensor_type.shape.dim])
print("Output name:", model.graph.output[0].name)
print("Output shape:", [d.dim_value for d in model.graph.output[0].type.tensor_type.shape.dim])
```

Expected output:
```
Input name: input
Input shape: [1, 3, 112, 112]
Output name: output
Output shape: [1, 512]
```

## Step 6: Configure Environment

Create or update `.env` file:

```bash
cd c:\Omsystems
```

Add to `.env`:

```env
# Face Recognition Configuration
ARCFACE_MODEL_PATH=C:/Omsystems/analytics-engine/models/face/arcface-r100.onnx

# Optional: Face Detector Model
FACE_DETECTOR_MODEL_PATH=C:/Omsystems/analytics-engine/models/face/retinaface.onnx

# Optional: GPU Acceleration
# ONNX_EXECUTION_PROVIDERS=cuda,cpu

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/your_database
```

Verify model path:

```bash
dir "C:\Omsystems\analytics-engine\models\face\arcface-r100.onnx"
```

## Step 7: Test the Setup

Create `test-face-recognition.ts`:

```typescript
import { FaceEmbeddingService } from './analytics-engine/src/face/face-embedding.service.js';

async function test() {
  console.log('Testing face recognition setup...\n');

  // Test 1: Load embedding service
  console.log('1. Loading ArcFace model...');
  const service = new FaceEmbeddingService({
    modelPath: process.env.ARCFACE_MODEL_PATH || 
              'C:/Omsystems/analytics-engine/models/face/arcface-r100.onnx',
  });

  try {
    await service.initialize();
    console.log('✓ Model loaded successfully\n');
  } catch (error) {
    console.error('✗ Model loading failed:', error);
    process.exit(1);
  }

  // Test 2: Extract embedding
  console.log('2. Testing embedding extraction...');
  const dummyFace = new Float32Array(3 * 112 * 112);
  for (let i = 0; i < dummyFace.length; i++) {
    dummyFace[i] = Math.random() * 2 - 1; // Random values [-1, 1]
  }

  try {
    const embedding = await service.extractEmbedding(dummyFace, 1.0);
    console.log('✓ Embedding extracted');
    console.log('  - Dimension:', embedding.vector.length);
    console.log('  - Model:', embedding.modelName);
    console.log('  - Version:', embedding.modelVersion);
    
    // Verify normalization
    let sum = 0;
    for (const val of embedding.vector) {
      sum += val * val;
    }
    const norm = Math.sqrt(sum);
    console.log('  - L2 Norm:', norm.toFixed(6), '(should be ~1.0)\n');
  } catch (error) {
    console.error('✗ Embedding extraction failed:', error);
    process.exit(1);
  }

  // Test 3: Database connection
  console.log('3. Testing database connection...');
  const { Pool } = await import('pg');
  const db = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const result = await db.query('SELECT COUNT(*) FROM face_watchlists');
    console.log('✓ Database connected');
    console.log('  - Watchlists:', result.rows[0].count, '\n');
  } catch (error) {
    console.error('✗ Database connection failed:', error);
    process.exit(1);
  } finally {
    await db.end();
  }

  console.log('✅ All tests passed! Face recognition is ready.\n');
}

test().catch(console.error);
```

Run test:

```bash
npx tsx test-face-recognition.ts
```

Expected output:
```
Testing face recognition setup...

1. Loading ArcFace model...
✓ Model loaded successfully

2. Testing embedding extraction...
✓ Embedding extracted
  - Dimension: 512
  - Model: arcface-r100
  - Version: 1.0.0
  - L2 Norm: 1.000000 (should be ~1.0)

3. Testing database connection...
✓ Database connected
  - Watchlists: 0

✅ All tests passed! Face recognition is ready.
```

## Step 8: Initialize Services in Your App

Add to your main application file (`src/app.ts` or similar):

```typescript
import { Pool } from 'pg';
import { FaceRecognitionService } from '../analytics-engine/src/face/face-recognition.service.js';
import { FaceEnrollmentService } from '../analytics-engine/src/face/face-enrollment.service.js';
import { FaceWatchlistService } from './services/face-watchlist.service.js';
import { FaceTrackAggregator } from '../analytics-engine/src/face/face-track-aggregator.js';

// Initialize database pool
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
});

// Initialize face recognition services
console.log('Initializing face recognition services...');

const faceRecognitionService = new FaceRecognitionService(db, {
  modelPath: process.env.ARCFACE_MODEL_PATH,
  modelName: 'arcface-r100',
  modelVersion: '1.0.0',
});

await faceRecognitionService.initialize();

const faceEnrollmentService = new FaceEnrollmentService(
  db,
  faceRecognitionService,
  {
    maxImagesPerPerson: 10,
    checkDuplicates: true,
  }
);

const faceWatchlistService = new FaceWatchlistService(
  db,
  faceEnrollmentService
);

const faceTrackAggregator = new FaceTrackAggregator(db);
faceTrackAggregator.start();

// Make services available to routes
app.locals.db = db;
app.locals.faceRecognitionService = faceRecognitionService;
app.locals.faceEnrollmentService = faceEnrollmentService;
app.locals.faceWatchlistService = faceWatchlistService;
app.locals.faceTrackAggregator = faceTrackAggregator;

console.log('✓ Face recognition services initialized');
```

Register routes:

```typescript
import faceWatchlistRoutes from './routes/face-watchlist.routes.js';
import faceRecognitionRoutes from './routes/face-recognition.routes.js';

app.use('/api/face-watchlists', faceWatchlistRoutes);
app.use('/api/face-recognition', faceRecognitionRoutes);
```

## Step 9: Create First Watchlist

### Via API

```bash
curl -X POST http://localhost:3000/api/face-watchlists \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Security Staff",
    "description": "Authorized security personnel",
    "listType": "staff",
    "enabled": true,
    "matchThreshold": 0.70,
    "reviewThreshold": 0.60
  }'
```

### Via SQL

```sql
INSERT INTO face_watchlists (
  tenant_id,
  name,
  description,
  list_type,
  enabled,
  created_by
) VALUES (
  'your-tenant-id',
  'Security Staff',
  'Authorized security personnel',
  'staff',
  true,
  'your-user-id'
);
```

## Step 10: Enroll First Person

Use the frontend UI or API:

```bash
curl -X POST http://localhost:3000/api/face-watchlists/{watchlist-id}/persons \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "displayName=John Doe" \
  -F "externalId=EMP-001" \
  -F "images=@photo1.jpg" \
  -F "images=@photo2.jpg"
```

## Troubleshooting

### Issue: Cannot find module 'onnxruntime-node'

```bash
cd analytics-engine
npm install onnxruntime-node
```

### Issue: pgvector extension not found

Install pgvector:

**Ubuntu/Debian:**
```bash
sudo apt install postgresql-16-pgvector
```

**macOS:**
```bash
brew install pgvector
```

**Windows:**
Download from: https://github.com/pgvector/pgvector/releases

### Issue: Model file not found

Check path:
```bash
dir "C:\Omsystems\analytics-engine\models\face\arcface-r100.onnx"
```

Use absolute path in .env:
```env
ARCFACE_MODEL_PATH=C:/Omsystems/analytics-engine/models/face/arcface-r100.onnx
```

### Issue: Sharp installation fails on Windows

Try:
```bash
npm install --platform=win32 --arch=x64 sharp
```

Or use prebuilt binaries:
```bash
npm install sharp --ignore-scripts=false --foreground-scripts --verbose
```

## Next Steps

1. ✅ Follow deployment checklist: `FACE_RECOGNITION_DEPLOYMENT_CHECKLIST.md`
2. ✅ Review setup guide: `FACE_RECOGNITION_SETUP_GUIDE.md`
3. ✅ Start enrolling persons via UI
4. ✅ Configure watchlist thresholds
5. ✅ Test live recognition

## Need Help?

- Check logs: `docker logs analytics-engine` or application logs
- Review documentation: `FACE_RECOGNITION_IMPLEMENTATION.md`
- Check database: `psql -d db -c "SELECT * FROM face_watchlists;"`
- Verify model: Run `test-face-recognition.ts`

---

**You're all set! The face recognition system is ready to use.** 🎉
