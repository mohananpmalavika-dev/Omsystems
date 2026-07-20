FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY dashboard/package.json ./dashboard/package.json
COPY edge-agent/package.json ./edge-agent/package.json
COPY media-gateway/package.json ./media-gateway/package.json
RUN npm ci
COPY edge-agent/tsconfig.json ./edge-agent/tsconfig.json
COPY edge-agent/src ./edge-agent/src
RUN npm run build --workspace @sentinel/edge-agent

FROM node:22-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
COPY dashboard/package.json ./dashboard/package.json
COPY edge-agent/package.json ./edge-agent/package.json
COPY media-gateway/package.json ./media-gateway/package.json
RUN npm ci --omit=dev --workspace @sentinel/edge-agent
COPY --from=build /app/edge-agent/dist ./edge-agent/dist
USER node
CMD ["node", "edge-agent/dist/src/index.js"]
