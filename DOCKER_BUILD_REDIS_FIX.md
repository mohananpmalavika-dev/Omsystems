# Docker Build Redis Module Fix

## Problem

The Docker build for `analytics-engine` was failing with this TypeScript compilation error:

```
../backend/src/services/distributed-event-bus.service.ts(10,47): error TS2307: Cannot find module 'redis' or its corresponding type declarations.
```

## Root Cause

The `analytics-engine/Dockerfile` copies `backend/src` files during the build process:

```dockerfile
# Copy shared source (needed for cross-workspace imports)
COPY src src
COPY backend/src backend/src
```

The backend service `distributed-event-bus.service.ts` imports from the `redis` package:

```typescript
import { createClient, RedisClientType } from 'redis';
```

However, the `redis` dependency was only listed in the root `package.json`, not in `analytics-engine/package.json`. When running:

```bash
npm ci --workspace @sentinel/analytics-engine
```

The workspace-specific install doesn't include dependencies from the root package.json that aren't explicitly listed in the workspace's own package.json.

## Solution

Added `redis` v6.2.0 to the `analytics-engine/package.json` dependencies:

```json
"dependencies": {
  "exceljs": "^4.4.0",
  "fastify": "^5.2.1",
  "onnxruntime-node": "^1.27.0",
  "pdfkit": "^0.19.1",
  "pg": "^8.22.0",
  "redis": "^6.2.0",   // ✅ Added
  "sharp": "^0.34.5",
  "zod": "^3.24.2"
}
```

## Verification

The `redis` module import is now resolved:

```bash
npm list redis
sentinel-grid@0.1.0 C:\Omsystems
├─┬ @sentinel/analytics-engine@0.1.0 -> .\analytics-engine
│ └── redis@6.2.0 deduped
└── redis@6.2.0
```

TypeScript can now successfully compile the distributed-event-bus service without module errors.

## Note on Remaining Build Errors

The `analytics-engine` build still has other TypeScript errors unrelated to this Docker build fix. These are pre-existing type safety issues in the analytics-engine codebase that need to be addressed separately. The specific Docker build failure related to the missing `redis` module has been resolved.

## Files Changed

- `analytics-engine/package.json` - Added `redis` dependency

## Next Steps

If you need a clean analytics-engine build:

1. The redis module error is fixed ✅
2. The remaining 49 TypeScript errors in the analytics-engine need separate attention
3. These appear to be interface mismatches, missing properties, and type incompatibilities throughout the codebase

## Docker Build Command

You can now retry your Docker build:

```bash
docker build -f analytics-engine/Dockerfile -t analytics-engine:latest .
```

The redis module error should no longer appear.
