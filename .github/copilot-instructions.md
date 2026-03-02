# Copilot Instructions (ws-network)

These instructions are for AI coding assistants working in this repository.

## Code Style

- TypeScript is strict. Keep `tsconfig.json` constraints satisfied:
  - `strict: true`
  - `isolatedModules: true`
  - `noUnusedLocals: true`
  - `noUnusedParameters: true`
- Formatting/linting uses Biome (`biome.json`):
  - 2-space indent
  - 80-column line width
  - single quotes
  - trailing commas where valid (es5)
- Prefer explicit, typed APIs; avoid `as any`, `@ts-ignore`, and unused params.

## Architecture (ws-network)

- Client is adapter-based:
  - `WebSocketClient<T>` delegates to `WebSocketClientAdapter<T>`.
  - Concrete adapters live in `src/lib/WebSocketClient.ts`.
- Native WebSocket is the primary target:
  - Keep `src/lib/WebSocketClient.ts` native-only (browser `WebSocket`).
  - Do NOT import `@stomp/stompjs` from `src/lib/WebSocketClient.ts`.
  - Do NOT add STOMP-only methods to `WebSocketClient` (no `publish/subscribe` on base).
- STOMP is opt-in and isolated:
  - STOMP code lives under `src/lib/protocols/stomp/`.
  - Use `src/lib/protocols/stomp/StompWebSocketClient.ts` for STOMP-only API.
- Worker entrypoints live in `src/lib/workers/`.
  - Keep worker message protocol consistent and predictable.
  - Avoid mixing raw and typed worker messages in the same channel.

## Workers (Message Protocol)

- Use a typed envelope for all cross-thread messages; do not send raw strings and typed objects together.
- Preferred envelope shape:
  - `{ type: 'CONNECTED' }`
  - `{ type: 'MESSAGE', data: string }`
  - `{ type: 'ERROR', error: string }`
  - `{ type: 'CLOSED' }`
- Control messages (like ping/pong) should also be enveloped (e.g., `{ type: 'PING' }`).
- URL injection:
  - Worker URL may include `?wsUrl=...`
  - Fallback may use `VITE_WS_URL`

## Configuration

- Demo (`src/main.ts`) uses:
  - `VITE_WS_URL` for native WebSocket
  - `VITE_STOMP_BROKER_URL` for STOMP (optional)
- Do not hardcode URLs or connect headers in `src/`.

## Security / Config

- Do not hardcode credentials, tokens, device keys, or environment-specific URLs.
- URLs and connect headers must be injectable via constructor params/options.
- Keep safe defaults for demos, but do not ship real secrets in source.

## Repo Conventions

- Canonical skill content is under `.agents/skills/`.
  - Do not edit `.agent/skills/`, `.claude/skills/`, `.cline/skills/` (symlink mirrors).
- Do not edit `.opencode/node_modules/`.

## Verification

- Before finishing, run:
  - `npm run build`
  - `npm run lint`
