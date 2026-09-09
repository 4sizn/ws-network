# Plan: <one-line title>

- **Spec:** `docs/sdlc/<slug>/spec.md`
- **Date:** YYYY-MM-DD
- **Status:** draft | approved | done

**Goal:** one sentence.

**Architecture:** two or three sentences on the approach and where the new code
lives.

## Steps

Each step is one action, verifiable on its own. Name the exact file.

1. **<action>** — `src/lib/....ts`
   - Change: ...
   - Verify: `npm test` / `npm run lint` / manual check
2. **Write the failing test** — `src/lib/....test.ts`
   - Verify: test fails for the expected reason
3. **Implement** — `src/lib/....ts`
   - Verify: test passes
4. **Commit** — message: `<type>: <summary>`

## Files touched

| File | New / modified | Why |
|------|----------------|-----|
| | | |

## Verification

Commands to run at the end, with expected result:

```bash
npm test
npm run lint
npm run build   # when types or exports changed
```

## Rollback

How to undo this if it goes wrong — usually the revert commit, but note any
config or dependency change that does not revert with the code.

## Deviations

Filled in during implementation. Anything done differently from this plan, and
why. An empty section at the end means the plan held.
