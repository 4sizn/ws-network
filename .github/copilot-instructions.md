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
- Worker entrypoints live in `src/lib/workers/`.
  - Keep worker message protocol consistent and predictable.
  - Avoid mixing raw and typed worker messages in the same channel.

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
