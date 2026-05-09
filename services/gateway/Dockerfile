FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/protocol/package.json ./packages/protocol/
COPY services/gateway/package.json ./services/gateway/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/protocol ./packages/protocol
COPY services/gateway ./services/gateway
RUN pnpm --filter @treasure-hunt/protocol build
RUN pnpm --filter @treasure-hunt/gateway build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY --from=build /app /app
EXPOSE 3000
CMD ["node", "services/gateway/dist/index.js"]
