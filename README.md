# Treasure Hunt

Two-player real-time treasure-hunt game. See `docs/superpowers/specs/` for the full design.

## Prerequisites

- Node 22 (`nvm use`)
- pnpm 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- Docker Desktop

## Develop

```bash
pnpm install
pnpm build
pnpm test
```

## Run the full stack

```bash
docker compose up
```

Then open http://localhost:5173 (web) — services live at:

- Gateway: http://localhost:3000
- Lobby: http://localhost:3001
- Game: http://localhost:3002
- Stats: http://localhost:3003
- RabbitMQ management UI: http://localhost:15672 (user `guest`, pw `guest`)
- Postgres: `localhost:5432` (user/pw/db all `treasure`)
