FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY dashboard/package.json ./dashboard/package.json
COPY edge-agent/package.json ./edge-agent/package.json
COPY media-gateway/package.json ./media-gateway/package.json
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
RUN npm ci --omit=dev --workspace @sentinel/media-gateway
COPY --from=build /app/media-gateway/dist ./media-gateway/dist
USER node
CMD ["node", "media-gateway/dist/src/index.js"]
