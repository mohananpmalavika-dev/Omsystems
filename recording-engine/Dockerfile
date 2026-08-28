FROM node:22-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY recording-engine/package.json ./recording-engine/package.json
RUN npm ci
COPY recording-engine ./recording-engine
RUN npm run build --workspace @sentinel/recording-engine
EXPOSE 8091
CMD ["node", "recording-engine/dist/src/index.js"]
