FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY dashboard/package.json ./dashboard/package.json
COPY edge-agent/package.json ./edge-agent/package.json
COPY media-gateway/package.json ./media-gateway/package.json
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
COPY dashboard/package.json ./dashboard/package.json
COPY edge-agent/package.json ./edge-agent/package.json
COPY media-gateway/package.json ./media-gateway/package.json
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY scripts/run-migrations.mjs ./scripts/run-migrations.mjs
COPY database/migrations ./database/migrations
EXPOSE 8080
USER node
CMD ["sh", "-c", "node scripts/run-migrations.mjs && node dist/src/index.js"]
