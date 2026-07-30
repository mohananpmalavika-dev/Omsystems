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
COPY edge-agent/tsconfig.build.json ./edge-agent/tsconfig.build.json
COPY media-gateway/package.json ./media-gateway/package.json
COPY recording-engine/package.json ./recording-engine/package.json
COPY analytics-engine/package.json ./analytics-engine/package.json
RUN npm ci
COPY tsconfig.json ./
COPY edge-agent/scripts ./edge-agent/scripts
COPY edge-agent/THIRD_PARTY_NOTICES.txt ./edge-agent/THIRD_PARTY_NOTICES.txt
RUN npm run fetch:windows-runtime --workspace @sentinel/edge-agent
COPY src ./src
COPY edge-agent/src ./edge-agent/src
COPY edge-agent/installer ./edge-agent/installer
RUN npm run build && npm run build --workspace @sentinel/edge-agent && npm run build:exe --workspace @sentinel/edge-agent && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
COPY dashboard/package.json ./dashboard/package.json
COPY edge-agent/package.json ./edge-agent/package.json
COPY --from=build /app/edge-agent/build ./edge-agent/build
COPY --from=build /app/edge-agent/release ./edge-agent/release
COPY --from=build /app/edge-agent/installer ./edge-agent/installer
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
