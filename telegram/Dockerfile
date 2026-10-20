# Бот + мини-приложение одним контейнером. База — в томе /data
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production TZ=Europe/Moscow DATA_DIR=/data PORT=8080
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
VOLUME /data
EXPOSE 8080
CMD ["node", "--no-warnings=ExperimentalWarning", "dist/server.mjs"]
