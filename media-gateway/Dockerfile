FROM bluenviron/mediamtx:1.17.1 AS mediamtx

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY dashboard/package.json ./dashboard/package.json
COPY edge-agent/package.json ./edge-agent/package.json
COPY media-gateway/package.json ./media-gateway/package.json
COPY recording-engine/package.json ./recording-engine/package.json
COPY analytics-engine/package.json ./analytics-engine/package.json
RUN npm ci
COPY media-gateway/tsconfig.json ./media-gateway/tsconfig.json
COPY media-gateway/src ./media-gateway/src
RUN npm run build --workspace @sentinel/media-gateway

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
COPY dashboard/package.json ./dashboard/package.json
COPY edge-agent/package.json ./edge-agent/package.json
COPY media-gateway/package.json ./media-gateway/package.json
COPY recording-engine/package.json ./recording-engine/package.json
COPY analytics-engine/package.json ./analytics-engine/package.json
RUN npm ci --omit=dev --workspace @sentinel/media-gateway
COPY --from=build /app/media-gateway/dist ./media-gateway/dist
COPY --from=mediamtx /mediamtx /usr/local/bin/mediamtx
COPY media-gateway/mediamtx.render.yml ./media-gateway/mediamtx.render.yml
COPY --chmod=755 media-gateway/start-render.sh ./media-gateway/start-render.sh
USER node
CMD ["media-gateway/start-render.sh"]
