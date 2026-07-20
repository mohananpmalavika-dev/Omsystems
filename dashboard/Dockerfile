FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY dashboard/package.json ./dashboard/package.json
COPY edge-agent/package.json ./edge-agent/package.json
COPY media-gateway/package.json ./media-gateway/package.json
RUN npm ci
COPY dashboard ./dashboard
RUN npm run build --workspace @sentinel/dashboard

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/dashboard/.next/standalone ./
COPY --from=build /app/dashboard/.next/static ./dashboard/.next/static
COPY --from=build /app/dashboard/public ./dashboard/public
EXPOSE 3000
USER node
CMD ["node", "dashboard/server.js"]
