---
name: ai-native-sdlc
description: "Run work through the AI-native SDLC loop (intent -> spec -> plan -> build/test -> deploy -> maintain) with version-controlled artifacts and human gates. Use when starting a feature, bug fix, refactor, or incident follow-up in this repo; when asked for an intent/spec/plan document; when preparing or reviewing a PR; or when someone asks how work should flow from idea to production here."
---

# AI-Native SDLC

Adapted for `ws-network` from Anthropic's AI-native SDLC playbook
(https://claude.com/blog/the-ai-native-sdlc-playbook).

## Why

Writing code is no longer the bottleneck — the stages around it are. This skill
turns those stages into a loop with **markdown artifacts as the handoff format**
and **humans at the gates that need judgment**, not at every step.

Every artifact is committed. The chain of commits *is* the audit trail.

## The loop

| Stage | Artifact | Gate (human) |
|-------|----------|--------------|
| 1. Plan | `docs/sdlc/<slug>/intent.md` | Owner accepts the intent |
| 2. Design | `docs/sdlc/<slug>/spec.md` | Owner accepts scope + constraints |
| 3. Build | `docs/sdlc/<slug>/plan.md`, code, `AGENTS.md` | Plan approved before code |
| 4. Test | test files, `npm test` / `npm run lint` output | — (automated) |
| 5. Deploy | PR description, review findings | Reviewer approves merge |
| 6. Maintain | new `intent.md` from an incident/regression | Owner triages |

Stage 6 feeds Stage 1. That is the whole point — the loop closes.

## How to use it

**Do not run all six stages for every change.** Pick the entry point:

- Vague idea, no agreement yet → start at **Stage 1**.
- Agreed idea, unclear design → start at **Stage 2**.
- Clear requirement, needs implementing → start at **Stage 3**.
- Bug with a known cause, < ~20 lines → skip to a PR; no artifacts required.
- Incident or repeated failure → **Stage 6**, which produces an `intent.md`.

Announce the entry point in one line before starting, e.g.
"Entering at Stage 3 (Build) — spec already agreed in `docs/sdlc/mqtt/spec.md`."

Full per-stage instructions: `references/stages.md`.
Artifact templates: `templates/intent.md`, `templates/spec.md`, `templates/plan.md`.
Governance, metrics, autonomy tiers: `references/governance.md`.

## Repo-specific rules (non-negotiable)

These come from `AGENTS.md` at the repo root and bind every stage:

- TypeScript strict, `isolatedModules`, `noUnusedLocals`, `noUnusedParameters`.
- Biome formatting: 2-space indent, 80 columns, single quotes.
- No hardcoded URLs and no secrets in `src/` — config must be injected.
- Preserve the adapter design in `src/lib/WebSocketClient.ts`; keep it
  native-WebSocket-only.
- Each non-native protocol stays isolated and opt-in under
  `src/lib/protocols/<protocol>/`. Never import a protocol into the native module.
- Worker entrypoints stay under `src/lib/workers/` with typed `postMessage`
  payloads only.
- Third-party protocol libraries are **injected, not hardwired** — an adapter
  accepts a client instance (or factory) so the caller pins the module version.
- Verify with `npm test` and `npm run lint` before claiming a stage is done.

## Hard gates

1. **No code before an approved plan** when entering at Stage 1 or 2.
2. **Tests are immutable while fixing a failure.** A failing test is evidence.
   Change the code, or state explicitly why the test itself is wrong and get
   agreement first.
3. **Report failures verbatim.** If `npm test` fails, paste the output; never
   describe a stage as complete on unverified work.
4. **Nothing outward-facing without approval** — pushes, PRs, releases,
   published artifacts. Ask, unless the user already authorized it.

## Artifact locations

```
docs/sdlc/<slug>/intent.md   # Stage 1 — the ask, in the originator's words
docs/sdlc/<slug>/spec.md     # Stage 2 — requirements + design + constraints
docs/sdlc/<slug>/plan.md     # Stage 3 — file-by-file implementation steps
```

`<slug>` is short kebab-case, e.g. `mqtt-protocol`, `worker-typed-envelope`.
Keep each artifact under one page. Long artifacts stop being read.
