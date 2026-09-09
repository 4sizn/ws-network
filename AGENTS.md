# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-27
**Commit:** (unborn)
**Branch:** master

## OVERVIEW
This repo is a local bundle of LLM/agent skills (mostly Markdown + a few scripts). The canonical source lives under `.agents/skills/`; `.agent/skills/`, `.claude/skills/`, and `.cline/skills/` mirror it via symlinks.

## STRUCTURE
```
./
├── .agents/skills/               # canonical skill content
├── .agent/skills/                # symlink mirror -> .agents/skills
├── .claude/skills/               # symlink mirror -> .agents/skills
├── .cline/skills/                # symlink mirror -> .agents/skills
├── .opencode/                    # local OpenCode plugin deps (has node_modules/)
├── opencode.json                 # OpenCode model/provider config
└── skills-lock.json              # pinned skills sources + hashes
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Find available skills | `.agents/skills/` | Each subdir is one skill.
| Take work from idea to merge | `.agents/skills/ai-native-sdlc/SKILL.md` | Stage loop + `intent.md`/`spec.md`/`plan.md` templates.
| Learn a skill's trigger + instructions | `.agents/skills/<skill>/SKILL.md` | YAML frontmatter name/description + body.
| React/Next perf guidelines (compiled) | `.agents/skills/vercel-react-best-practices/AGENTS.md` | Large generated doc; use as reference.
| Remotion guidance | `.agents/skills/remotion-best-practices/rules/` | Topic-based rule files.
| Skill authoring/evals tooling | `.agents/skills/skill-creator/` | Python scripts + HTML viewer.
| Change model/provider | `opencode.json` | `model`, `small_model`, enabled providers.
| See pinned upstream sources | `skills-lock.json` | Maps skill -> GitHub repo + computed hash.

## CONVENTIONS
- Canonical edits go in `.agents/skills/` (other tool-specific directories are symlink mirrors).
- Skill layout is `SKILL.md` plus optional `rules/`, `scripts/`, `references/`, `assets/`.
- OpenCode `task` calls must use `run_in_background` (boolean). Do not use `run_background`.
- Default execution mode for independent agent tasks is parallel background: launch multiple `task(...)` calls with `run_in_background: true`.
- Only use `run_in_background: false` when downstream steps require immediate, sequential task output.

## ANTI-PATTERNS (THIS PROJECT)
- Do not edit `.agent/skills/`, `.claude/skills/`, `.cline/skills/` directly; they are symlink mirrors.
- Do not edit `.opencode/node_modules/` (generated vendored deps).

## WS-NETWORK CODE RULES

- TypeScript is strict and enforces `isolatedModules` + `noUnusedLocals` + `noUnusedParameters` (`tsconfig.json`).
- Biome formatting uses 2-space indent, 80 columns, single quotes (`biome.json`).
- Avoid hardcoded URLs and any secrets (tokens, keys) in `src/`; require config injection.
- Preserve the adapter-based design in `src/lib/WebSocketClient.ts` and keep worker entrypoints under `src/lib/workers/`.
- Native WebSocket is the primary target; keep `src/lib/WebSocketClient.ts` native-only.
- Keep STOMP isolated under `src/lib/protocols/stomp/` (opt-in). Do not reintroduce STOMP imports into the native module.
- Tests come in three tiers: `npm test` (unit, fake, offline), `npm run
  test:integration` (in-process aedes broker over TCP, real `mqtt` client),
  and a manual browser tier via `VITE_MQTT_BROKER_URL`. Configs are
  `vitest.config.ts` and `vitest.integration.config.ts`; the unit tier excludes
  `*.integration.test.ts`.
- The integration broker runs over TCP, not WebSocket. `aedes` served over ws
  via `aedes-server-factory` does not complete the handshake with a real `mqtt`
  client: the ws server never selects the required `mqtt` subprotocol, and the
  client then fails silently with no events. Do not retry that path without
  fixing the subprotocol AND the aedes stream bridge.
- `src/main.ts` loads the MQTT adapter and `mqtt` with dynamic `import()` so
  neither lands in the main bundle. Keep it that way.
- MQTT injects the `mqtt` module instead of importing it: the adapter takes a
  `connect` factory (`MqttConnect<TOptions>`), so `mqtt` never enters
  `dependencies`. It is a devDependency pinned to `5.14.0` for the
  type-compatibility test only.
- `mqtt` drags in `@types/node@26`, which root TypeScript 4.9.5 cannot parse
  (`skipLibCheck` does not suppress syntax errors). `package.json` pins it with
  `overrides: { "@types/node": "^20" }`. Removing that override breaks `tsc`.
- STOMP is unfinished. Mirror its names and field shapes, not its behavior:
  it skips plugin hooks on connect, drops `plugins`/`logger`, never tells the
  broker about an unsubscribe, and throws in `networkStatus()`.
- Worker protocol should be typed and consistent; do not mix raw and typed `postMessage` payloads.
- Route feature/refactor/incident work through the `ai-native-sdlc` skill; its artifacts live in `docs/sdlc/<slug>/`.

## COMMANDS
```bash
# quick inventory
ls -la .agents/skills

# find all skills by name
find .agents/skills -maxdepth 2 -name SKILL.md -print

# inspect pinned sources
cat skills-lock.json
```
