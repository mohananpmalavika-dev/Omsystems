FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY dashboard/package.json dashboard/package.json
COPY edge-agent/package.json edge-agent/package.json
COPY media-gateway/package.json media-gateway/package.json
COPY recording-engine/package.json recording-engine/package.json
COPY analytics-engine/package.json analytics-engine/package.json
RUN npm ci --workspace @sentinel/analytics-engine
COPY analytics-engine analytics-engine
RUN npm run build --workspace @sentinel/analytics-engine
CMD ["node", "analytics-engine/dist/src/index.js"]
