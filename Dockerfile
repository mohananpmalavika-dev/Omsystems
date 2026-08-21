# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src/ ./src/
COPY packages/ ./packages/
COPY analytics-engine/ ./analytics-engine/
COPY edge-agent/ ./edge-agent/
COPY backend/ ./backend/
COPY root-cause-analysis-engine/ ./root-cause-analysis-engine/
RUN npm ci --ignore-scripts
RUN npm run build

# Stage 2: Production
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["node", "build/index.js"]
