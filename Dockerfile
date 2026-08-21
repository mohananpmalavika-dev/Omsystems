# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src/ ./src/
COPY backend/ ./backend/
COPY packages/ ./packages/
COPY analytics-engine/ ./analytics-engine/
COPY edge-agent/ ./edge-agent/
COPY root-cause-analysis-engine/ ./root-cause-analysis-engine/
RUN npm ci --ignore-scripts
RUN npm run build

# Build edge-agent bundle for Linux downloads
WORKDIR /app/edge-agent
RUN npm ci --ignore-scripts
RUN npm run bundle
WORKDIR /app

# Stage 2: Production
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/edge-agent/build ./edge-agent/build
COPY --from=builder /app/edge-agent/release ./edge-agent/release
COPY --from=builder /app/edge-agent/package.json ./edge-agent/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["node", "dist/src/index.js"]
