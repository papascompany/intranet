FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app /app

# Payroll volume mounts here; pre-create it owned by node so the named volume
# inherits writable ownership on first use.
RUN mkdir -p /data/payroll && chown -R node:node /data/payroll

EXPOSE 3000
USER node

# Container liveness only: / is served once the process is up. /api/health is a
# dependency check (503 until env/DB are right) and must not gate the container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 3000}/`).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["./node_modules/.bin/tsx", "server.ts"]
