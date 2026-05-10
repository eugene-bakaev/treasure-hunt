# Nickname propagation + Game publishes match results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire nicknames end-to-end from Web to Game, and publish final match results to RabbitMQ from the Game service.

**Architecture:** 
1. Web client stores nickname in `localStorage` and appends it as a query param.
2. Gateway extracts the nickname and sends it in the `player_join` internal message.
3. Game service stores nicknames and tracking info in `GameMatch`.
4. Game service uses a `RabbitMQPublisher` to send `MatchResultsMsg` when a match ends.

**Tech Stack:** TypeScript, Node.js, RabbitMQ (`amqplib`), React, Vitest.

---

### Task 1: Web - Nickname storage and propagation

**Files:**
- Modify: `web/src/net/socket.ts`

- [ ] **Step 1: Add getNickname and setNickname helpers**
- [ ] **Step 2: Update connect to include nickname in query params**

### Task 2: Gateway - Extract and pass nickname

**Files:**
- Modify: `services/gateway/src/ws/clientHandler.ts`

- [ ] **Step 1: Extract nickname from searchParams**
- [ ] **Step 2: Pass nickname to proxy.send({ type: 'player_join', ... })**

### Task 3: Game - Add amqplib and RabbitMQPublisher

**Files:**
- Modify: `services/game/package.json`
- Create: `services/game/src/rabbitmq/publisher.ts`
- Create: `services/game/test/rabbitmq/publisher.test.ts`

- [ ] **Step 1: Add dependencies to package.json**
- [ ] **Step 2: Implement RabbitMQPublisher class**
- [ ] **Step 3: Write tests for RabbitMQPublisher (using mocks for amqplib)**

### Task 4: Game - Update GameMatch for nicknames and results

**Files:**
- Modify: `services/game/src/match/GameMatch.ts`
- Modify: `services/game/test/match/GameMatch.test.ts`

- [ ] **Step 1: Add nicknames, startedAt, and results callback to GameMatch**
- [ ] **Step 2: Update addPlayer to accept nickname**
- [ ] **Step 3: Implement result publishing when match ends**
- [ ] **Step 4: Update tests to verify result publishing**

### Task 5: Game - Integration in GameWsServer and index.ts

**Files:**
- Modify: `services/game/src/ws/GameWsServer.ts`
- Modify: `services/game/src/index.ts`

- [ ] **Step 1: Update GameWsServer to handle nickname in player_join**
- [ ] **Step 2: Initialize RabbitMQPublisher in index.ts and pass to GameWsServer**
- [ ] **Step 3: Final verification of the whole flow**
