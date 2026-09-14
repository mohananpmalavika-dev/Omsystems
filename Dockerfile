# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./

ENV npm_config_onnxruntime_node_install_cuda=skip
ENV ONNXRUNTIME_NODE_INSTALL_CUDA=skip
RUN npm install --legacy-peer-deps

COPY src/ ./src/
COPY database/migrations/ ./database/migrations/
COPY scripts/run-migrations.mjs ./scripts/run-migrations.mjs
COPY packages/ ./packages/
COPY config/ ./config/
COPY root-cause-analysis-engine/ ./root-cause-analysis-engine/
COPY analytics-engine/ ./analytics-engine/
COPY edge-agent/ ./edge-agent/

# Supply the Windows release separately: edge-agent.exe is not tracked in Git.
# Fail before replacing a working image if the release is missing or mismatched.
RUN node edge-agent/scripts/verify-windows-production-release.mjs

ENV NODE_OPTIONS="--max-old-space-size=3072"
RUN npm run build


# Supply a Windows release with a matching checksum manifest. Authenticode
# signing is optional; the manifest does not establish publisher trust.
WORKDIR /app/edge-agent
RUN npm install --legacy-peer-deps
RUN npm run bundle:delta || true
RUN mkdir -p /app/edge-agent/build /app/edge-agent/installer
WORKDIR /app

# Stage 2: Production
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Copy package files first
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

# Install production dependencies
RUN npm install --omit=dev --legacy-peer-deps


# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config ./config

COPY --from=builder /app/database/migrations ./database/migrations
COPY --from=builder /app/scripts/run-migrations.mjs ./scripts/run-migrations.mjs
COPY --from=builder /app/edge-agent/build ./edge-agent/build
COPY --from=builder /app/edge-agent/release ./edge-agent/release
COPY --from=builder /app/edge-agent/installer ./edge-agent/installer
COPY --from=builder /app/edge-agent/package.json ./edge-agent/package.json

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["sh", "-c", "node scripts/run-migrations.mjs && node dist/src/index.js"]
