# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src/ ./src/
COPY backend/ ./backend/
COPY database/migrations/ ./database/migrations/
COPY scripts/run-migrations.mjs ./scripts/run-migrations.mjs
COPY packages/ ./packages/
COPY analytics-engine/ ./analytics-engine/
COPY edge-agent/ ./edge-agent/
RUN npm install --legacy-peer-deps
ENV NODE_OPTIONS="--max-old-space-size=3072"
RUN npm run build

# Build the cross-platform edge-agent bundle and the activation-bound
# Windows self-installer served by the control plane.
WORKDIR /app/edge-agent
RUN npm install --legacy-peer-deps
RUN npm run build:exe
RUN npm run bundle:delta
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
COPY --from=builder /app/backend ./backend
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
