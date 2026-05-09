FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY web/package.json ./web/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY web ./web
RUN pnpm --filter @treasure-hunt/web build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY --from=build /app /app
EXPOSE 5173
CMD ["pnpm", "--filter", "@treasure-hunt/web", "preview", "--port", "5173"]
