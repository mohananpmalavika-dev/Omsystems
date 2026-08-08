# Multi-stage build for analytics engine
FROM node:22-bookworm-slim AS build

# Build context is project root
WORKDIR /workspace

# Copy root package files for workspace setup
COPY package.json package-lock.json ./
COPY tsconfig.json ./

# Copy workspace package.json files
COPY dashboard/package.json dashboard/package.json
COPY edge-agent/package.json edge-agent/package.json  
COPY media-gateway/package.json media-gateway/package.json
COPY recording-engine/package.json recording-engine/package.json
COPY analytics-engine/package.json analytics-engine/package.json
COPY analytics-engine/tsconfig.json analytics-engine/tsconfig.json

# Install dependencies for analytics-engine workspace only
# Render's current worker is CPU-only. Explicitly skip the optional CUDA bundle;
# otherwise onnxruntime-node attempts a large provider download during npm ci.
ENV ONNXRUNTIME_NODE_INSTALL=skip
RUN npm ci --workspace @sentinel/analytics-engine

# Copy shared source (needed for cross-workspace imports)
COPY src src

# Copy analytics-engine source
COPY analytics-engine/src analytics-engine/src
COPY analytics-engine/models/manifest.json analytics-engine/models/manifest.json

# Build TypeScript
RUN npm run build --workspace @sentinel/analytics-engine
RUN test -f /workspace/analytics-engine/dist/analytics-engine/src/index.js

# Prune dev dependencies
RUN npm prune --omit=dev --workspace @sentinel/analytics-engine

# Production stage
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Security: Create non-root user
RUN groupadd --gid 1001 analytics && \
    useradd --uid 1001 --gid analytics --create-home --shell /usr/sbin/nologin analytics

WORKDIR /app

# Copy built application and production dependencies
COPY --from=build --chown=analytics:analytics /workspace/analytics-engine/package.json ./
COPY --from=build --chown=analytics:analytics /workspace/analytics-engine/dist ./dist
COPY --from=build --chown=analytics:analytics /workspace/node_modules ./node_modules
RUN test -f /app/dist/analytics-engine/src/index.js

# Create models directory for ML models
RUN mkdir -p /app/models && chown analytics:analytics /app/models
COPY --from=build --chown=analytics:analytics /workspace/analytics-engine/models/manifest.json /app/models/manifest.json
ENV MODELS_DIR=/app/models
# The image contains only the model manifest. Keep normalized edge-observation
# ingestion available until an operator mounts verified ONNX artifacts and
# explicitly opts into strict local-inference readiness at runtime.
ENV ANALYTICS_REQUIRE_MODELS=false

# Switch to non-root user
USER analytics

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8092/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Expose analytics engine port
EXPOSE 8092

# Start application
CMD ["node", "dist/analytics-engine/src/index.js"]
