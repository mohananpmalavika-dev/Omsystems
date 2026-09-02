FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY packages ./packages
COPY recording-engine ./recording-engine
RUN npm install --legacy-peer-deps
RUN cd recording-engine && npx tsc -p tsconfig.json

FROM node:22-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package.json package-lock.json ./
COPY recording-engine/package.json ./recording-engine/package.json
RUN npm install --omit=dev --legacy-peer-deps --workspace @sentinel/recording-engine
COPY --from=build /app/recording-engine/dist ./recording-engine/dist
EXPOSE 8091
CMD ["node", "recording-engine/dist/src/index.js"]
