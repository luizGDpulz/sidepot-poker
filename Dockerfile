# Stage 1: Multi-Arch Native Builder (compiles TS + Vite without QEMU emulation overhead)
FROM --platform=$BUILDPLATFORM node:24-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.9.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json ./packages/core/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY apps/client/package.json ./apps/client/package.json

RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps ./apps

RUN pnpm run build && \
    pnpm --filter @sidepot/server deploy --prod --legacy /prod/server

# Stage 2: Minimal Hardened Production Runtime (Non-Root)
FROM node:24-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STATIC_DIR=/app/public

COPY --from=builder --chown=node:node /prod/server/package.json ./package.json
COPY --from=builder --chown=node:node /prod/server/node_modules ./node_modules
COPY --from=builder --chown=node:node /prod/server/dist ./dist
COPY --from=builder --chown=node:node /app/apps/client/dist ./public

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
