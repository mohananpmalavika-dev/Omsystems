# Multi-stage build for analytics engine
FROM node:22-alpine AS build

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
RUN npm ci --workspace @sentinel/analytics-engine

# Copy analytics-engine source
COPY analytics-engine/src analytics-engine/src

# Build TypeScript
RUN npm run build --workspace @sentinel/analytics-engine

# Prune dev dependencies
RUN npm prune --omit=dev --workspace @sentinel/analytics-engine

# Production stage
FROM node:22-alpine

# Security: Create non-root user
RUN addgroup -g 1001 -S analytics && \
    adduser -u 1001 -S analytics -G analytics

WORKDIR /app

# Copy built application and production dependencies
COPY --from=build --chown=analytics:analytics /workspace/analytics-engine/package.json ./
COPY --from=build --chown=analytics:analytics /workspace/analytics-engine/dist ./dist
COPY --from=build --chown=analytics:analytics /workspace/node_modules ./node_modules

# Create models directory for ML models
RUN mkdir -p /app/models && chown analytics:analytics /app/models

# Switch to non-root user
USER analytics

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8092/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Expose analytics engine port
EXPOSE 8092

# Start application
CMD ["node", "dist/src/index.js"]
