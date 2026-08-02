FROM bluenviron/mediamtx:1.17.1 AS mediamtx-runtime
FROM cloudflare/cloudflared:2026.5.2 AS cloudflared-runtime

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY dashboard/package.json ./dashboard/package.json
COPY edge-agent/package.json ./edge-agent/package.json
COPY media-gateway/package.json ./media-gateway/package.json
COPY recording-engine/package.json ./recording-engine/package.json
COPY analytics-engine/package.json ./analytics-engine/package.json
RUN npm ci
COPY edge-agent/tsconfig.json ./edge-agent/tsconfig.json
COPY edge-agent/tsconfig.build.json ./edge-agent/tsconfig.build.json
COPY edge-agent/src ./edge-agent/src
RUN npm run bundle --workspace @sentinel/edge-agent

FROM node:22-alpine
RUN apk add --no-cache ffmpeg ca-certificates
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
COPY dashboard/package.json ./dashboard/package.json
COPY edge-agent/package.json ./edge-agent/package.json
COPY media-gateway/package.json ./media-gateway/package.json
COPY recording-engine/package.json ./recording-engine/package.json
COPY analytics-engine/package.json ./analytics-engine/package.json
RUN npm ci --omit=dev --workspace @sentinel/edge-agent
COPY --from=build /app/edge-agent/build ./edge-agent/build
COPY --from=mediamtx-runtime /mediamtx /usr/local/bin/mediamtx
COPY --from=cloudflared-runtime /usr/local/bin/cloudflared /usr/local/bin/cloudflared
RUN mkdir -p /var/lib/sentinel/data /var/lib/sentinel/logs /var/lib/sentinel/runtime \
    && chmod 0755 /usr/local/bin/mediamtx /usr/local/bin/cloudflared \
    && chown -R node:node /var/lib/sentinel
USER node
CMD ["node", "edge-agent/build/edge-agent.cjs"]
