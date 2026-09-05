FROM bluenviron/mediamtx:1.17.1 AS mediamtx

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY packages ./packages
COPY dashboard/package.json ./dashboard/package.json
COPY edge-agent/package.json ./edge-agent/package.json
COPY media-gateway ./media-gateway
COPY recording-engine/package.json ./recording-engine/package.json
COPY analytics-engine/package.json ./analytics-engine/package.json
RUN npm install --legacy-peer-deps
RUN cd media-gateway && npx tsc -p tsconfig.json

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
COPY packages ./packages
COPY dashboard/package.json ./dashboard/package.json
COPY edge-agent/package.json ./edge-agent/package.json
COPY media-gateway/package.json ./media-gateway/package.json
COPY recording-engine/package.json ./recording-engine/package.json
COPY analytics-engine/package.json ./analytics-engine/package.json
RUN npm install --omit=dev --legacy-peer-deps --workspace @sentinel/media-gateway
COPY --from=build /app/media-gateway/dist ./media-gateway/dist
COPY --from=mediamtx /mediamtx /usr/local/bin/mediamtx
COPY media-gateway/mediamtx.yml ./media-gateway/mediamtx.yml
COPY --chmod=755 media-gateway/start.sh ./media-gateway/start.sh
RUN sed -i 's/\r$//' ./media-gateway/start.sh
USER node
CMD ["sh", "media-gateway/start.sh"]
