# Reproducibly convert the official Apache-2.0 PaddleClas PULC safety-helmet
# inference export before the Node build. The converter image is discarded, so
# Paddle is never part of the runtime image.
FROM python:3.10-slim AS helmet-model

WORKDIR /build
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl libgomp1 tar \
    && rm -rf /var/lib/apt/lists/*
RUN curl --fail --location --retry 3 --output safety_helmet_infer.tar \
      https://paddleclas.bj.bcebos.com/models/PULC/safety_helmet_infer.tar \
    && echo "6e7cff9c4e3f3966b1d964c7f27c47577d9b31d725a4c8b625e68cb9affdcaa7  safety_helmet_infer.tar" | sha256sum --check \
    && tar -xf safety_helmet_infer.tar \
    && python -m pip install --no-cache-dir paddlepaddle==2.6.2 paddle2onnx==1.2.6 six==1.16.0 \
    && paddle2onnx \
      --model_dir /build/safety_helmet_infer \
      --model_filename inference.pdmodel \
      --params_filename inference.pdiparams \
      --save_file /build/helmet.onnx \
      --opset_version 11 \
      --enable_onnx_checker True \
    && echo "8c87834e2fde4eb29723483cdecedf78c231cf7e6da9913cf8227ba542b3f31f  helmet.onnx" | sha256sum --check

# Multi-stage build for analytics engine
FROM node:22-bookworm-slim AS build

# Build context is project root
WORKDIR /workspace

# Copy root package files for workspace setup
COPY package.json package-lock.json ./
COPY tsconfig.json ./

# Copy workspace package.json files
COPY packages packages
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
COPY packages packages
COPY src src
COPY backend/src backend/src

# Copy analytics-engine source
COPY analytics-engine/src analytics-engine/src
COPY analytics-engine/models/manifest.json analytics-engine/models/manifest.json
COPY analytics-engine/scripts analytics-engine/scripts
COPY analytics-engine/THIRD_PARTY_MODELS.md analytics-engine/THIRD_PARTY_MODELS.md
COPY --from=helmet-model /build/helmet.onnx analytics-engine/models/safety/helmet.onnx

# Provision audited open-license CPU models at build time. Every download is
# checksum-verified by the repository script; no paid inference API is used.
RUN ANALYTICS_MODEL_LICENSES_ACCEPTED=true npm run models:download --workspace @sentinel/analytics-engine -- yolov8n face-detector face-embedding anpr-detector anpr-recognizer

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

# Copy the manifest and checksum-verified open model provisioned in the build stage.
COPY --from=build --chown=analytics:analytics /workspace/analytics-engine/models /app/models
COPY --from=build --chown=analytics:analytics /workspace/analytics-engine/THIRD_PARTY_MODELS.md /app/THIRD_PARTY_MODELS.md
ENV MODELS_DIR=/app/models
ENV ANALYTICS_REQUIRE_MODELS=true

# Switch to non-root user
USER analytics

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8092/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Expose analytics engine port
EXPOSE 8092

# Start application
CMD ["node", "dist/analytics-engine/src/index.js"]
