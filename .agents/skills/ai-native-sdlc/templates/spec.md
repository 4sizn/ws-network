# Spec: <one-line title>

- **Intent:** `docs/sdlc/<slug>/intent.md`
- **Date:** YYYY-MM-DD
- **Status:** draft | accepted
- **Owner:** <name>

## Scope

What this change covers, in one paragraph.

## Out of scope

Explicit list. This section prevents the most rework — do not leave it empty.

## Acceptance criteria

Testable statements, each one verifiable by a test or a command.

- [ ] AC1: ...
- [ ] AC2: ...

## Design

The chosen approach: public API surface, new files, and how it fits the
existing adapter design. Include signatures for anything exported.

## Approaches considered

| Approach | Trade-off | Verdict |
|----------|-----------|---------|
| A (chosen) | | recommended because ... |
| B | | rejected because ... |

## Constraint check

Confirm each repo constraint from the skill, or state the exception and why:

- [ ] Strict TS clean (`isolatedModules`, no unused locals/params)
- [ ] Biome format (2-space, 80 col, single quotes)
- [ ] No hardcoded URLs or secrets in `src/` — config injected
- [ ] `src/lib/WebSocketClient.ts` stays native-WebSocket-only
- [ ] Protocol code isolated and opt-in under `src/lib/protocols/<protocol>/`
- [ ] Third-party protocol module injected by the caller, not hardwired
- [ ] Worker payloads typed, entrypoints under `src/lib/workers/`

## Test strategy

What is unit-tested with a fake adapter, what needs the demo server, and what
is deliberately untested.

## Risks

What could go wrong, and the cheapest signal that it did.
