FROM node:22-alpine AS build
WORKDIR /app
# onnxruntime-node's CUDA bundle is optional and unavailable on the CPU-only
# deployment image. Use its supported environment variable so npm ci never
# attempts the provider download (or treats an .npmrc key as unsupported).
ENV ONNXRUNTIME_NODE_INSTALL=skip
COPY package*.json ./
COPY dashboard/package.json ./dashboard/package.json
COPY edge-agent/package.json ./edge-agent/package.json
COPY edge-agent/tsconfig.json ./edge-agent/tsconfig.json
COPY media-gateway/package.json ./media-gateway/package.json
COPY recording-engine/package.json ./recording-engine/package.json
COPY analytics-engine/package.json ./analytics-engine/package.json
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY edge-agent/src ./edge-agent/src
RUN npm run build && npm run build --workspace @sentinel/edge-agent && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
COPY dashboard/package.json ./dashboard/package.json
COPY edge-agent/package.json ./edge-agent/package.json
COPY edge-agent/dist ./edge-agent/dist
COPY media-gateway/package.json ./media-gateway/package.json
COPY recording-engine/package.json ./recording-engine/package.json
COPY analytics-engine/package.json ./analytics-engine/package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY scripts/run-migrations.mjs ./scripts/run-migrations.mjs
COPY database/migrations ./database/migrations
EXPOSE 8080
USER node
CMD ["sh", "-c", "node scripts/run-migrations.mjs && node dist/src/index.js"]
