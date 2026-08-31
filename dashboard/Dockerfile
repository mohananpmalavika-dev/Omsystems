FROM node:22-alpine AS build
WORKDIR /app/dashboard
COPY dashboard/package.json ./
RUN npm install --legacy-peer-deps
COPY dashboard/ ./
COPY backend/ ../backend/
ARG CONTROL_PLANE_INTERNAL_URL=http://localhost:8080
ARG MEDIA_GATEWAY_INTERNAL_URL=http://localhost:8090
ENV CONTROL_PLANE_INTERNAL_URL=$CONTROL_PLANE_INTERNAL_URL
ENV MEDIA_GATEWAY_INTERNAL_URL=$MEDIA_GATEWAY_INTERNAL_URL
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV CONTROL_PLANE_INTERNAL_URL=http://localhost:8080
ENV MEDIA_GATEWAY_INTERNAL_URL=http://localhost:8090
WORKDIR /app
COPY --from=build /app/dashboard/.next/standalone ./
COPY --from=build /app/dashboard/.next/static ./dashboard/.next/static
COPY --from=build /app/dashboard/.next/static ./.next/static
COPY --from=build /app/dashboard/public ./dashboard/public
COPY --from=build /app/dashboard/public ./public
EXPOSE 10000
USER node
CMD ["node", "dashboard/server.js"]
