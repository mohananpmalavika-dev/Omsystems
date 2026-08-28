FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY dashboard/package.json ./dashboard/package.json
COPY edge-agent/package.json ./edge-agent/package.json
COPY media-gateway/package.json ./media-gateway/package.json
COPY recording-engine/package.json ./recording-engine/package.json
COPY analytics-engine/package.json ./analytics-engine/package.json
RUN npm ci
ARG CONTROL_PLANE_INTERNAL_URL=http://localhost:8080
ARG MEDIA_GATEWAY_INTERNAL_URL=http://localhost:8090
ENV CONTROL_PLANE_INTERNAL_URL=$CONTROL_PLANE_INTERNAL_URL
ENV MEDIA_GATEWAY_INTERNAL_URL=$MEDIA_GATEWAY_INTERNAL_URL
COPY dashboard ./dashboard
COPY backend ./backend
ENV NODE_OPTIONS="--max-old-space-size=3072"
RUN --mount=type=cache,target=/root/.cache/next-swc \
    npm run build --workspace @sentinel/dashboard

FROM node:22-alpine
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV CONTROL_PLANE_INTERNAL_URL=http://localhost:8080
ENV MEDIA_GATEWAY_INTERNAL_URL=http://localhost:8090
WORKDIR /app
COPY --from=build /app/dashboard/.next/standalone ./
COPY --from=build /app/dashboard/.next/static ./dashboard/.next/static
COPY --from=build /app/dashboard/public ./dashboard/public
EXPOSE 10000
USER node
CMD ["node", "dashboard/server.js"]
