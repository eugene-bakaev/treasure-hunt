# Phase 0 — Repo Skeleton & Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Treasure Hunt monorepo with all four backend services as healthchecked stubs, the React frontend with three empty routes, Docker Compose orchestrating everything (including Postgres and RabbitMQ), and a working CI pipeline. End state: `docker compose up` produces a running system; the browser can load the home / lobby / match screens (empty placeholders).

**Architecture:** pnpm workspace monorepo. Four Node/TypeScript services (`gateway`, `lobby`, `game`, `stats`), each its own package with a Dockerfile. One shared `protocol` package for cross-service types. One `web` package (Vite + React + TS). Docker Compose adds Postgres 16 and RabbitMQ 3. No real functionality yet — services expose only `/health` endpoints; frontend renders only routing scaffolding.

**Tech Stack:** Node 22, TypeScript 5, pnpm 9, Express 4, ws (WebSocket), React 18, React Router 6, Vite 5, Docker Compose, GitHub Actions, ESLint, Prettier, Vitest.

**Spec reference:** `docs/superpowers/specs/2026-05-09-treasure-hunt-design.md`. This plan implements §9 Phase 0 only.

---

## File Structure

After this plan, the repo will look like:

```
treasure-hunt/
├── .editorconfig
├── .gitignore
├── .nvmrc                              # node 22
├── .prettierrc.json
├── .prettierignore
├── eslint.config.js                    # flat config
├── package.json                        # root workspace
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── docker-compose.yml
├── README.md
├── .github/
│   └── workflows/
│       └── ci.yml
├── docs/
│   └── superpowers/                    # specs and plans (already exists)
├── packages/
│   └── protocol/                       # shared cross-service types
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           └── index.ts
├── services/
│   ├── gateway/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                # bootstrap
│   │   │   └── server.ts               # express app factory
│   │   └── test/
│   │       └── server.test.ts
│   ├── lobby/                          # same shape as gateway
│   ├── game/                           # same shape as gateway
│   └── stats/                          # same shape as gateway
└── web/
    ├── Dockerfile
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── screens/
        │   ├── Home.tsx
        │   ├── Lobby.tsx
        │   └── Match.tsx
        └── styles.css
```

**Boundaries:**
- Each service is fully self-contained: own `package.json`, own `Dockerfile`, own tests. Services share types via the `protocol` package only.
- `services/*/src/server.ts` is a pure factory (`createServer()` returns the Express app) — testable without binding a port. `services/*/src/index.ts` is the entry point that calls the factory and listens.
- `web/` is the only frontend package. No SSR.
- `protocol/` exports types only — no runtime code in Phase 0 (will gain runtime helpers in later phases).

---

## Conventions used throughout

- Every service exposes `GET /health` returning `{"status": "ok", "service": "<name>"}` with HTTP 200. This is the contract Compose healthchecks rely on.
- Every service reads `PORT` from env, defaulting to a service-specific value: gateway 3000, lobby 3001, game 3002, stats 3003.
- All TypeScript is strict mode, ES2022 target, ESM module output.
- Each commit is small and focused. Use conventional commit messages: `feat:`, `chore:`, `test:`, `docs:`, `ci:`.

---

## Task 1: Initialize git repo and root workspace

**Files:**
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `.editorconfig`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `README.md`

- [ ] **Step 1: Initialize git**

```bash
cd /Users/eugenebakaev/Development/treasure-hunt
git init
git checkout -b main
```

Expected: `Initialized empty Git repository in .git/`.

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
dist/
build/
coverage/
.turbo/
*.log
.DS_Store
.env
.env.local
.env.*.local
.vite/
playwright-report/
test-results/
```

- [ ] **Step 3: Create `.nvmrc`**

```
22
```

- [ ] **Step 4: Create `.editorconfig`**

```
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 5: Create root `package.json`**

```json
{
  "name": "treasure-hunt",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22",
    "pnpm": ">=9"
  },
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "devDependencies": {
    "prettier": "^3.3.3",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 6: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "services/*"
  - "web"
```

- [ ] **Step 7: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 8: Create `README.md`**

```markdown
# Treasure Hunt

Two-player real-time treasure-hunt game. See `docs/superpowers/specs/` for the full design.

## Prerequisites

- Node 22 (`nvm use`)
- pnpm 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- Docker Desktop

## Develop

\`\`\`bash
pnpm install
pnpm build
pnpm test
\`\`\`

## Run the full stack

\`\`\`bash
docker compose up
\`\`\`

Then open http://localhost:5173 (web) — services live at:

- Gateway: http://localhost:3000
- Lobby: http://localhost:3001
- Game: http://localhost:3002
- Stats: http://localhost:3003
- RabbitMQ management UI: http://localhost:15672 (user `guest`, pw `guest`)
- Postgres: `localhost:5432` (user/pw/db all `treasure`)
```

- [ ] **Step 9: Install root deps and commit**

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install
git add .
git commit -m "chore: initialize monorepo with pnpm workspaces"
```

Expected: clean install (no errors). First commit shows the seven files plus an empty `pnpm-lock.yaml`.

---

## Task 2: Add Prettier and ESLint

**Files:**
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `eslint.config.js`
- Modify: `package.json` (add lint/format devDeps)

- [ ] **Step 1: Create `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

- [ ] **Step 2: Create `.prettierignore`**

```
node_modules/
dist/
build/
coverage/
pnpm-lock.yaml
*.md
```

- [ ] **Step 3: Add ESLint flat config — `eslint.config.js`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['**/dist/**', '**/build/**', '**/coverage/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];
```

- [ ] **Step 4: Install lint deps**

```bash
pnpm add -D -w @eslint/js eslint typescript-eslint
```

Expected: deps added to root `package.json`. (`-w` installs at the workspace root.)

- [ ] **Step 5: Add root lint script — modify `package.json`**

Replace the existing `"lint"` line with:

```json
"lint": "eslint .",
```

- [ ] **Step 6: Verify lint runs cleanly on the (mostly empty) repo**

```bash
pnpm lint
pnpm format:check
```

Expected: both pass with no errors. (Lint may say "No files matching" if no `.ts` files exist yet — that's fine.)

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "chore: add eslint and prettier"
```

---

## Task 3: Create the `protocol` package

**Files:**
- Create: `packages/protocol/package.json`
- Create: `packages/protocol/tsconfig.json`
- Create: `packages/protocol/src/index.ts`

- [ ] **Step 1: Create `packages/protocol/package.json`**

```json
{
  "name": "@treasure-hunt/protocol",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "echo 'no tests yet' && exit 0",
    "lint": "eslint src"
  }
}
```

- [ ] **Step 2: Create `packages/protocol/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/protocol/src/index.ts`**

```ts
// Phase 0 stub. Real WS message and event types arrive in Phase 1.

export type ServiceName = 'gateway' | 'lobby' | 'game' | 'stats';

export interface HealthResponse {
  status: 'ok';
  service: ServiceName;
}
```

- [ ] **Step 4: Build the package**

```bash
pnpm --filter @treasure-hunt/protocol build
```

Expected: `dist/index.js` and `dist/index.d.ts` are produced.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(protocol): add shared protocol package skeleton"
```

---

## Task 4: Scaffold the gateway service

**Files:**
- Create: `services/gateway/package.json`
- Create: `services/gateway/tsconfig.json`
- Create: `services/gateway/src/server.ts`
- Create: `services/gateway/src/index.ts`
- Create: `services/gateway/test/server.test.ts`
- Create: `services/gateway/Dockerfile`

- [ ] **Step 1: Create `services/gateway/package.json`**

```json
{
  "name": "@treasure-hunt/gateway",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src test"
  },
  "dependencies": {
    "@treasure-hunt/protocol": "workspace:*",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.7.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `services/gateway/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "references": [{ "path": "../../packages/protocol" }],
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Install service deps**

```bash
pnpm install
```

Expected: pnpm hoists deps; the workspace dependency on `@treasure-hunt/protocol` resolves to the local package.

- [ ] **Step 4: Write the failing test — `services/gateway/test/server.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from '../src/server.js';

describe('gateway server', () => {
  it('GET /health returns service-tagged ok', async () => {
    const app = createServer();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'gateway' });
  });
});
```

- [ ] **Step 5: Run test to confirm it fails**

```bash
pnpm --filter @treasure-hunt/gateway test
```

Expected: failure — `Cannot find module '../src/server.js'` (or similar).

- [ ] **Step 6: Implement `services/gateway/src/server.ts`**

```ts
import express, { type Express } from 'express';
import type { HealthResponse } from '@treasure-hunt/protocol';

export function createServer(): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok', service: 'gateway' };
    res.status(200).json(body);
  });

  return app;
}
```

- [ ] **Step 7: Implement `services/gateway/src/index.ts`**

```ts
import { createServer } from './server.js';

const port = Number(process.env.PORT ?? 3000);
const app = createServer();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[gateway] listening on :${port}`);
});
```

- [ ] **Step 8: Run test to confirm it passes**

```bash
pnpm --filter @treasure-hunt/protocol build
pnpm --filter @treasure-hunt/gateway test
```

Expected: PASS. (We build `protocol` first because the gateway imports its built types.)

- [ ] **Step 9: Verify the dev server boots**

```bash
pnpm --filter @treasure-hunt/gateway dev &
sleep 2
curl -sS http://localhost:3000/health
kill %1
```

Expected: `{"status":"ok","service":"gateway"}`.

- [ ] **Step 10: Create `services/gateway/Dockerfile`**

```dockerfile
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
```

- [ ] **Step 11: Commit**

```bash
git add .
git commit -m "feat(gateway): add stub service with /health endpoint"
```

---

## Task 5: Scaffold the lobby service

**Files (mirror Task 4):**
- Create: `services/lobby/package.json`
- Create: `services/lobby/tsconfig.json`
- Create: `services/lobby/src/server.ts`
- Create: `services/lobby/src/index.ts`
- Create: `services/lobby/test/server.test.ts`
- Create: `services/lobby/Dockerfile`

- [ ] **Step 1: Copy gateway shape with name changes**

`services/lobby/package.json`:

```json
{
  "name": "@treasure-hunt/lobby",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src test"
  },
  "dependencies": {
    "@treasure-hunt/protocol": "workspace:*",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.7.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `services/lobby/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "references": [{ "path": "../../packages/protocol" }],
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Run install**

```bash
pnpm install
```

- [ ] **Step 4: Write the failing test — `services/lobby/test/server.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from '../src/server.js';

describe('lobby server', () => {
  it('GET /health returns service-tagged ok', async () => {
    const app = createServer();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'lobby' });
  });
});
```

- [ ] **Step 5: Run test to confirm it fails**

```bash
pnpm --filter @treasure-hunt/lobby test
```

Expected: FAIL (module not found).

- [ ] **Step 6: Implement `services/lobby/src/server.ts`**

```ts
import express, { type Express } from 'express';
import type { HealthResponse } from '@treasure-hunt/protocol';

export function createServer(): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok', service: 'lobby' };
    res.status(200).json(body);
  });

  return app;
}
```

- [ ] **Step 7: Implement `services/lobby/src/index.ts`**

```ts
import { createServer } from './server.js';

const port = Number(process.env.PORT ?? 3001);
const app = createServer();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[lobby] listening on :${port}`);
});
```

- [ ] **Step 8: Run tests**

```bash
pnpm --filter @treasure-hunt/lobby test
```

Expected: PASS.

- [ ] **Step 9: Create `services/lobby/Dockerfile`**

```dockerfile
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/protocol/package.json ./packages/protocol/
COPY services/lobby/package.json ./services/lobby/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/protocol ./packages/protocol
COPY services/lobby ./services/lobby
RUN pnpm --filter @treasure-hunt/protocol build
RUN pnpm --filter @treasure-hunt/lobby build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY --from=build /app /app
EXPOSE 3001
CMD ["node", "services/lobby/dist/index.js"]
```

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "feat(lobby): add stub service with /health endpoint"
```

---

## Task 6: Scaffold the game service

**Files (same shape):**
- Create: `services/game/package.json`
- Create: `services/game/tsconfig.json`
- Create: `services/game/src/server.ts`
- Create: `services/game/src/index.ts`
- Create: `services/game/test/server.test.ts`
- Create: `services/game/Dockerfile`

- [ ] **Step 1: Create `services/game/package.json`**

```json
{
  "name": "@treasure-hunt/game",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src test"
  },
  "dependencies": {
    "@treasure-hunt/protocol": "workspace:*",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.7.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `services/game/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "references": [{ "path": "../../packages/protocol" }],
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Run install**

```bash
pnpm install
```

- [ ] **Step 4: Write the failing test — `services/game/test/server.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from '../src/server.js';

describe('game server', () => {
  it('GET /health returns service-tagged ok', async () => {
    const app = createServer();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'game' });
  });
});
```

- [ ] **Step 5: Run test to confirm it fails**

```bash
pnpm --filter @treasure-hunt/game test
```

Expected: FAIL.

- [ ] **Step 6: Implement `services/game/src/server.ts`**

```ts
import express, { type Express } from 'express';
import type { HealthResponse } from '@treasure-hunt/protocol';

export function createServer(): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok', service: 'game' };
    res.status(200).json(body);
  });

  return app;
}
```

- [ ] **Step 7: Implement `services/game/src/index.ts`**

```ts
import { createServer } from './server.js';

const port = Number(process.env.PORT ?? 3002);
const app = createServer();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[game] listening on :${port}`);
});
```

- [ ] **Step 8: Run tests**

```bash
pnpm --filter @treasure-hunt/game test
```

Expected: PASS.

- [ ] **Step 9: Create `services/game/Dockerfile`**

```dockerfile
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
```

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "feat(game): add stub service with /health endpoint"
```

---

## Task 7: Scaffold the stats service

**Files (same shape):**
- Create: `services/stats/package.json`
- Create: `services/stats/tsconfig.json`
- Create: `services/stats/src/server.ts`
- Create: `services/stats/src/index.ts`
- Create: `services/stats/test/server.test.ts`
- Create: `services/stats/Dockerfile`

- [ ] **Step 1: Create `services/stats/package.json`**

```json
{
  "name": "@treasure-hunt/stats",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src test"
  },
  "dependencies": {
    "@treasure-hunt/protocol": "workspace:*",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.7.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `services/stats/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "references": [{ "path": "../../packages/protocol" }],
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Run install**

```bash
pnpm install
```

- [ ] **Step 4: Write the failing test — `services/stats/test/server.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from '../src/server.js';

describe('stats server', () => {
  it('GET /health returns service-tagged ok', async () => {
    const app = createServer();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'stats' });
  });
});
```

- [ ] **Step 5: Run test to confirm it fails**

```bash
pnpm --filter @treasure-hunt/stats test
```

Expected: FAIL.

- [ ] **Step 6: Implement `services/stats/src/server.ts`**

```ts
import express, { type Express } from 'express';
import type { HealthResponse } from '@treasure-hunt/protocol';

export function createServer(): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok', service: 'stats' };
    res.status(200).json(body);
  });

  return app;
}
```

- [ ] **Step 7: Implement `services/stats/src/index.ts`**

```ts
import { createServer } from './server.js';

const port = Number(process.env.PORT ?? 3003);
const app = createServer();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[stats] listening on :${port}`);
});
```

- [ ] **Step 8: Run tests**

```bash
pnpm --filter @treasure-hunt/stats test
```

Expected: PASS.

- [ ] **Step 9: Create `services/stats/Dockerfile`**

```dockerfile
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/protocol/package.json ./packages/protocol/
COPY services/stats/package.json ./services/stats/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/protocol ./packages/protocol
COPY services/stats ./services/stats
RUN pnpm --filter @treasure-hunt/protocol build
RUN pnpm --filter @treasure-hunt/stats build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY --from=build /app /app
EXPOSE 3003
CMD ["node", "services/stats/dist/index.js"]
```

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "feat(stats): add stub service with /health endpoint"
```

---

## Task 8: Scaffold the web frontend

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/screens/Home.tsx`
- Create: `web/src/screens/Lobby.tsx`
- Create: `web/src/screens/Match.tsx`
- Create: `web/src/styles.css`
- Create: `web/test/App.test.tsx`
- Create: `web/Dockerfile`

- [ ] **Step 1: Create `web/package.json`**

```json
{
  "name": "@treasure-hunt/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json && vite build",
    "dev": "vite",
    "preview": "vite preview --host 0.0.0.0",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src test"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.27.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `web/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "noEmit": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: Create `web/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
  },
});
```

- [ ] **Step 4: Create `web/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Create `web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Treasure Hunt</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Run install**

```bash
pnpm install
```

- [ ] **Step 7: Write the failing test — `web/test/App.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from '../src/App.js';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App routing', () => {
  it('renders Home at /', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: /treasure hunt/i })).toBeInTheDocument();
  });

  it('renders Lobby at /lobby', () => {
    renderAt('/lobby');
    expect(screen.getByRole('heading', { name: /lobby/i })).toBeInTheDocument();
  });

  it('renders Match at /match/:id', () => {
    renderAt('/match/abc-123');
    expect(screen.getByText(/match abc-123/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run test to confirm it fails**

```bash
pnpm --filter @treasure-hunt/web test
```

Expected: FAIL — `App` not found.

- [ ] **Step 9: Implement `web/src/screens/Home.tsx`**

```tsx
export default function Home() {
  return (
    <main>
      <h1>Treasure Hunt</h1>
      <p>Phase 0 placeholder — gameplay arrives in Phase 1.</p>
    </main>
  );
}
```

- [ ] **Step 10: Implement `web/src/screens/Lobby.tsx`**

```tsx
export default function Lobby() {
  return (
    <main>
      <h1>Lobby</h1>
      <p>Phase 0 placeholder — lobby arrives in Phase 2.</p>
    </main>
  );
}
```

- [ ] **Step 11: Implement `web/src/screens/Match.tsx`**

```tsx
import { useParams } from 'react-router-dom';

export default function Match() {
  const { id } = useParams<{ id: string }>();
  return (
    <main>
      <h1>Match</h1>
      <p>Match {id}</p>
    </main>
  );
}
```

- [ ] **Step 12: Implement `web/src/App.tsx`**

```tsx
import { Routes, Route } from 'react-router-dom';
import Home from './screens/Home.js';
import Lobby from './screens/Lobby.js';
import Match from './screens/Match.js';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/lobby" element={<Lobby />} />
      <Route path="/match/:id" element={<Match />} />
    </Routes>
  );
}
```

- [ ] **Step 13: Implement `web/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';
import './styles.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root');

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

- [ ] **Step 14: Implement `web/src/styles.css`**

```css
:root {
  font-family: system-ui, sans-serif;
  background: #111;
  color: #eee;
}

main {
  max-width: 720px;
  margin: 2rem auto;
  padding: 1rem;
}
```

- [ ] **Step 15: Run tests**

```bash
pnpm --filter @treasure-hunt/web test
```

Expected: all 3 routing tests PASS.

- [ ] **Step 16: Verify the dev server boots**

```bash
pnpm --filter @treasure-hunt/web dev &
sleep 3
curl -sS http://localhost:5173/ | grep -q "Treasure Hunt"
echo "exit=$?"
kill %1
```

Expected: `exit=0`. (HTML root is loaded; React routes hydrate client-side.)

- [ ] **Step 17: Create `web/Dockerfile`**

```dockerfile
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
```

- [ ] **Step 18: Commit**

```bash
git add .
git commit -m "feat(web): add React + Vite frontend with three placeholder routes"
```

---

## Task 9: Add Docker Compose orchestration

**Files:**
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Modify: `README.md` (verify the docker-compose section is accurate)

- [ ] **Step 1: Create `.dockerignore`**

```
node_modules
**/node_modules
**/dist
**/build
.git
.github
docs
**/coverage
**/.vite
*.log
.env
.env.*
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: treasure
      POSTGRES_PASSWORD: treasure
      POSTGRES_DB: treasure
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U treasure"]
      interval: 5s
      timeout: 5s
      retries: 10

  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"
      - "15672:15672"
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]
      interval: 5s
      timeout: 10s
      retries: 10

  gateway:
    build:
      context: .
      dockerfile: services/gateway/Dockerfile
    environment:
      PORT: "3000"
      POSTGRES_URL: postgres://treasure:treasure@postgres:5432/treasure
      RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672/
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 5s
      timeout: 5s
      retries: 10

  lobby:
    build:
      context: .
      dockerfile: services/lobby/Dockerfile
    environment:
      PORT: "3001"
      RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672/
    ports:
      - "3001:3001"
    depends_on:
      rabbitmq:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/health"]
      interval: 5s
      timeout: 5s
      retries: 10

  game:
    build:
      context: .
      dockerfile: services/game/Dockerfile
    environment:
      PORT: "3002"
      RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672/
    ports:
      - "3002:3002"
    depends_on:
      rabbitmq:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3002/health"]
      interval: 5s
      timeout: 5s
      retries: 10

  stats:
    build:
      context: .
      dockerfile: services/stats/Dockerfile
    environment:
      PORT: "3003"
      POSTGRES_URL: postgres://treasure:treasure@postgres:5432/treasure
      RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672/
    ports:
      - "3003:3003"
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3003/health"]
      interval: 5s
      timeout: 5s
      retries: 10

  web:
    build:
      context: .
      dockerfile: web/Dockerfile
    ports:
      - "5173:5173"
    depends_on:
      gateway:
        condition: service_healthy

volumes:
  pgdata:
```

Note: each service Dockerfile uses `node:22-alpine`, which does include `wget`. The healthcheck above relies on that.

- [ ] **Step 3: Smoke-test the stack**

```bash
docker compose up -d --build
sleep 30
docker compose ps
```

Expected: all services in `healthy` state (or `running` for `web`).

- [ ] **Step 4: Verify each service responds**

```bash
curl -sS http://localhost:3000/health && echo
curl -sS http://localhost:3001/health && echo
curl -sS http://localhost:3002/health && echo
curl -sS http://localhost:3003/health && echo
curl -sS http://localhost:5173/ | head -1
```

Expected output, in order:
```
{"status":"ok","service":"gateway"}
{"status":"ok","service":"lobby"}
{"status":"ok","service":"game"}
{"status":"ok","service":"stats"}
<!doctype html>
```

- [ ] **Step 5: Tear down**

```bash
docker compose down -v
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: add docker-compose orchestrating full stack"
```

---

## Task 10: Add CI pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  lint-build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build all packages
        run: pnpm build

      - name: Lint
        run: pnpm lint

      - name: Format check
        run: pnpm format:check

      - name: Test all packages
        run: pnpm test

  docker-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build all images via docker compose
        run: docker compose build
```

- [ ] **Step 2: Verify the CI commands run locally**

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm format:check
pnpm test
```

Expected: every command exits 0.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "ci: add GitHub Actions for build, lint, test, and docker build"
```

---

## Task 11: End-to-end smoke verification

**Goal:** prove the system works together before declaring Phase 0 done.

- [ ] **Step 1: Clean checkout simulation**

```bash
rm -rf node_modules **/node_modules
pnpm install --frozen-lockfile
```

Expected: install succeeds without errors.

- [ ] **Step 2: Run all tests**

```bash
pnpm test
```

Expected: tests in protocol (none), gateway, lobby, game, stats, web all pass. No failures.

- [ ] **Step 3: Build all packages**

```bash
pnpm build
```

Expected: all builds succeed; `dist/` directories appear under each service and `web/dist/` for the frontend.

- [ ] **Step 4: Run the full stack**

```bash
docker compose up -d --build
```

Wait until `docker compose ps` shows all of `gateway`, `lobby`, `game`, `stats`, `postgres`, `rabbitmq` as `healthy`. The `web` service should be `running` (no healthcheck defined for it).

- [ ] **Step 5: Verify all four service healthchecks return service-tagged JSON**

```bash
for port in 3000 3001 3002 3003; do
  echo -n "port $port: "
  curl -sS "http://localhost:$port/health"
  echo
done
```

Expected output:
```
port 3000: {"status":"ok","service":"gateway"}
port 3001: {"status":"ok","service":"lobby"}
port 3002: {"status":"ok","service":"game"}
port 3003: {"status":"ok","service":"stats"}
```

- [ ] **Step 6: Verify the frontend serves the placeholder pages**

```bash
curl -sS http://localhost:5173/ | grep -q '<div id="root">'
echo "home: exit=$?"

# Single-page app — all routes return the same shell; React Router resolves them client-side.
# Manual browser check still recommended for /, /lobby, /match/abc-123.
```

Expected: `home: exit=0`.

- [ ] **Step 7: Browser-side manual check (recorded as part of plan completion)**

Open in a browser:
- http://localhost:5173/ — should show "Treasure Hunt" heading and Phase 0 placeholder text.
- http://localhost:5173/lobby — should show "Lobby" heading.
- http://localhost:5173/match/abc-123 — should show "Match" heading and "Match abc-123".

- [ ] **Step 8: Tear down**

```bash
docker compose down -v
```

- [ ] **Step 9: Final commit (if anything was tweaked during smoke testing)**

If steps revealed nothing to fix, no commit is needed. Otherwise:

```bash
git add .
git commit -m "chore: phase 0 smoke fixes"
```

---

## Done criteria

Phase 0 is complete when:

1. `pnpm install && pnpm test && pnpm build && pnpm lint && pnpm format:check` all pass on a fresh clone.
2. `docker compose up -d --build` brings the full stack up; all four services report healthy.
3. All four `/health` endpoints return their expected service-tagged JSON.
4. Browser hits to `/`, `/lobby`, `/match/:id` render their placeholder content.
5. CI workflow passes on `main`.

When all five conditions hold, this plan is done and the next plan (Phase 1 — single-match vertical slice) can begin.
