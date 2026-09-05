# TitoMenu — production image for Railway (or any Docker host)
# Builds the React frontend + Express API and serves both from one server.

FROM node:22-slim AS build
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY lib ./lib
COPY artifacts/cafe-menu ./artifacts/cafe-menu
COPY artifacts/api-server ./artifacts/api-server
COPY scripts ./scripts
COPY attached_assets ./attached_assets
COPY tsconfig*.json ./

RUN pnpm install --frozen-lockfile || pnpm install

# Build frontend (served at site root) and API server
ENV BASE_PATH=/
RUN pnpm --filter @workspace/cafe-menu run build \
 && pnpm --filter @workspace/api-server run build

# ---- Runtime image ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/artifacts/api-server/dist ./server
COPY --from=build /app/artifacts/cafe-menu/dist/public ./public

ENV STATIC_DIR=/app/public
# Railway injects PORT automatically
EXPOSE 8080

CMD ["node", "--enable-source-maps", "server/index.mjs"]
