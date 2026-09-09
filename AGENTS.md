# ws-network

A browser WebSocket client library with an adapter-based design. Native
WebSocket is the primary target; other protocols are opt-in and isolated.

This repo also carries a bundle of agent skills. They are tooling, not the
product — see "AGENT SKILLS BUNDLE" near the end. If you are here to change
the library, everything you need is above that section.

## LIBRARY LAYOUT

```
src/
├── lib/WebSocketClient.ts        # core: client, adapter contract, plugins, RxJS streams
├── lib/utils.ts                  # tiny shared helpers
├── lib/protocols/<name>/         # one opt-in protocol per directory
├── lib/workers/                  # worker entrypoints (native WebSocket only today)
├── lib/adapters/                 # reserved; currently a placeholder
└── main.ts                       # demo app, not part of the library
server/                           # Node WebSocket echo server for the demo
```

Read `src/lib/WebSocketClient.ts` first. `WebSocketClient` owns the plugin
pipeline and the listener/stream registry; `WebSocketClientAdapter` is the seam
where a transport or protocol plugs in. Every protocol subclasses that adapter.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Understand the core contract | `src/lib/WebSocketClient.ts` | Client, adapter, plugin hook order, RxJS streams.
| Add protocol-specific send data | `WebSocketClientAdapter<TClient, TSend>` | `TSend` defaults to `void`; a protocol declares what a send needs (STOMP: `StompSendOptions`) and the core forwards it without inspecting it.
| Add or change a protocol | `src/lib/protocols/<name>/` | Adapter + facade + barrel. Opt-in, never imported by the core.
| Worker entrypoints | `src/lib/workers/` | Typed `postMessage` envelopes only.
| Run the demo | `README.md` "Demo" | Needs `server/` and `VITE_WS_URL`; STOMP path needs `npm run stomp:up` + `VITE_STOMP_BROKER_URL`.
| Verify a transport end to end | `src/**/*.integration.test.ts` | Real server in-process on an ephemeral port. Tiers split in `vitest.config.ts`.
| Verify STOMP against a real broker | `docker-compose.test.yml` + `WS_NETWORK_STOMP_URL` | `defineStompContract` runs the same tests on both brokers; skipped when the variable is unset.
| Find available skills | `.agents/skills/` | Each subdir is one skill.
| Take work from idea to merge | `.agents/skills/ai-native-sdlc/SKILL.md` | Stage loop + `intent.md`/`spec.md`/`plan.md` templates.
| See SDLC artifacts in flight | `docs/sdlc/<slug>/` | `stomp-facade-plugins` is the live one: intent and spec accepted, plan approved and implemented.
| Learn a skill's trigger + instructions | `.agents/skills/<skill>/SKILL.md` | YAML frontmatter name/description + body.
| React/Next perf guidelines (compiled) | `.agents/skills/vercel-react-best-practices/AGENTS.md` | Large generated doc; use as reference.
| Remotion guidance | `.agents/skills/remotion-best-practices/rules/` | Topic-based rule files.
| Skill authoring/evals tooling | `.agents/skills/skill-creator/` | Python scripts + HTML viewer.
| Change model/provider | `opencode.json` | `model`, `small_model`, enabled providers.
| See pinned upstream sources | `skills-lock.json` | Maps skill -> GitHub repo + computed hash.

## ANTI-PATTERNS (LIBRARY)

- Do not import a protocol into `src/lib/WebSocketClient.ts`. It stays
  native-WebSocket-only.
- Do not put test doubles in non-`.test.ts` files. Declare them inside the test
  file, the way `FakeAdapter` is declared in `src/lib/WebSocketClient.test.ts`.
  The in-process servers in `*.integration.test.ts` follow the same placement
  rule: each lives in the file that uses it, even though a real server is not
  a test double.
- Do not weaken a STOMP integration test to make it pass. If a defect is real,
  pin it with `it.fails` and a comment saying what is broken, then flip it to
  `it` in the commit that fixes it.
- Do not add a STOMP test that only the in-process broker can pass unless it
  inspects frames. Behaviour tests belong in `defineStompContract` so the real
  broker runs them too.
- Do not invent naming suffixes. Grep the neighbouring declarations first.
  The patterns actually in the tree, with their sample counts:
  - client/adapter/plugin contracts take an `I` prefix — `IWebSocketPlugin`,
    `IWebSocketClient`, `IWebSocketClientAdapter` (3)
  - a capability interface takes an `-Able` suffix and **no** `I` —
    `PubSubAble` (1)
  - options take a `<Class>Options` name — `StompWebSocketClientAdapterOptions`
  - a boolean helper takes an `is` prefix — `isString` (1)
  - a function-shaped alias is a plain noun, no `Fn` — `Unsubscribe` (1)

  Where the sample is one declaration, say so when proposing a name rather than
  presenting it as an established rule.

## WS-NETWORK CODE RULES

- TypeScript is strict and enforces `isolatedModules` + `noUnusedLocals` + `noUnusedParameters` (`tsconfig.json`).
- Biome formatting uses 2-space indent, 80 columns, single quotes (`biome.json`).
- Avoid hardcoded URLs and any secrets (tokens, keys) in `src/`; require config injection.
- Preserve the adapter-based design in `src/lib/WebSocketClient.ts` and keep worker entrypoints under `src/lib/workers/`.
- Native WebSocket is the primary target; keep `src/lib/WebSocketClient.ts` native-only.
- Keep STOMP isolated under `src/lib/protocols/stomp/` (opt-in). Do not reintroduce STOMP imports into the native module.
- Worker protocol should be typed and consistent; do not mix raw and typed `postMessage` payloads.
- Route feature/refactor/incident work through the `ai-native-sdlc` skill; its artifacts live in `docs/sdlc/<slug>/`.

## COMMANDS

```bash
npm ci                    # install exactly what the lockfile pins
npm test                  # unit tier (vitest project `unit`)
npm run test:integration  # integration tier (in-process ws/STOMP servers)
npm run test:integration:broker  # same STOMP contract against RabbitMQ (needs stomp:up)
npm run stomp:up          # docker compose (colima): RabbitMQ Web-STOMP on 15674
npm run stomp:down        # tear it down
npm run lint              # biome lint (does not check formatting)
npm run check             # biome check . — lint + format gate, same as CI
npm run check:apply       # biome check --apply . — fix what it can
npm run format            # biome format --write
npm run build             # tsc + vite build
npm run dev               # demo app
```

CI runs install, lint, unit tests, integration tests (the `test:integration`
script now exists, so the guarded step runs it), and build, plus a separate job
that builds `server/`: `.github/workflows/ci.yml`.

**CI gates formatting.** `npm run lint` is `biome lint`, which ignores
formatting, so a separate `npm run check` step runs `biome check .`. Two things
had to change before the gate could go in: `javascript.formatter.trailingComma`
was `es5` while every file in the tree uses trailing commas (now `all`), and
`files.ignore` did not cover the vendored skill bundle, so biome was checking
`.agents/skills/**/*.tsx`. Run `npm run check:apply` to fix violations locally.

## AGENT SKILLS BUNDLE

The rest of this file describes the agent skills carried in this repo. They do
not ship with the library. `.agents/skills/` is the canonical source;
`.agent/skills/`, `.claude/skills/` and `.cline/skills/` are symlink mirrors of
it. `opencode.json` selects the model/provider and `skills-lock.json` pins the
upstream sources.

### Conventions

- Canonical edits go in `.agents/skills/` (other tool-specific directories are symlink mirrors).
- Skill layout is `SKILL.md` plus optional `rules/`, `scripts/`, `references/`, `assets/`.
- OpenCode `task` calls must use `run_in_background` (boolean). Do not use `run_background`.
- Default execution mode for independent agent tasks is parallel background: launch multiple `task(...)` calls with `run_in_background: true`.
- Only use `run_in_background: false` when downstream steps require immediate, sequential task output.

### Anti-patterns

- Do not edit `.agent/skills/`, `.claude/skills/`, `.cline/skills/` directly; they are symlink mirrors.
- Do not edit `.opencode/node_modules/` (generated vendored deps).

### Commands

```bash
# quick inventory
ls -la .agents/skills

# find all skills by name
find .agents/skills -maxdepth 2 -name SKILL.md -print

# inspect pinned sources
cat skills-lock.json
```
