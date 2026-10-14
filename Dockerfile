# Runs the Plinth API, and optionally the background worker in the same process (RUN_WORKER=true). Test networks only.
FROM node:24-slim
RUN npm install -g pnpm@12.8.1
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
COPY deployments ./deployments
RUN pnpm install --frozen-lockfile --filter @plinth/api... --filter @plinth/worker...
ENV NODE_ENV=production
EXPOSE 10000
CMD ["pnpm", "--filter", "@plinth/api", "start"]
