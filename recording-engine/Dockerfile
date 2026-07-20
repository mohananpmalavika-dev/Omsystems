FROM node:22-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY dashboard/package.json dashboard/package.json
COPY edge-agent/package.json edge-agent/package.json
COPY media-gateway/package.json media-gateway/package.json
COPY recording-engine/package.json recording-engine/package.json
RUN npm ci --workspace @sentinel/recording-engine
COPY recording-engine recording-engine
RUN npm run build --workspace @sentinel/recording-engine
CMD ["node", "recording-engine/dist/src/index.js"]
