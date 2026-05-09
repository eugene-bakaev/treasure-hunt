FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/protocol/package.json ./packages/protocol/
COPY services/game/package.json ./services/game/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/protocol ./packages/protocol
COPY services/game ./services/game
RUN pnpm --filter @treasure-hunt/protocol build
RUN pnpm --filter @treasure-hunt/game build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY --from=build /app /app
EXPOSE 3002
CMD ["node", "services/game/dist/index.js"]
