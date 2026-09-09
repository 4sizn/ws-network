# Plan: generalise the send contract and wire STOMP plugins

- **Spec:** `docs/sdlc/stomp-facade-plugins/spec.md`
- **Date:** 2026-09-09
- **Status:** draft

**Goal:** `onBeforeSend`/`onAfterSend` run for every transport, including STOMP
publishes, without the core learning what a destination is.

**Architecture:** `WebSocketClientAdapter` and `WebSocketClient` take a second
type parameter `TSend` (default `void`), and `send`/`sendAsync` forward
`...args: SendArgs<TSend>` to the adapter after the before-send hooks. The STOMP
adapter declares `TSend = StompSendOptions` and implements `send`; the facade's
`publish()` becomes an alias that supplies `{ destination }`. Native code and
worker entrypoints are unchanged because their `TSend` stays `void`.

## Steps

1. **Write the contract tests first** — `src/lib/protocols/stomp/StompWebSocketClient.integration.test.ts`
   - Change: add `createClient(options?)` passthrough; add "runs connect and
     disconnect hooks for a facade client" (AC1) and "runs send hooks on publish
     and delivers the transformed body" (AC3). The transforming plugin must pass
     `PROBE` through untouched so `awaitSubscription` still works.
   - Verify: `npx tsc --noEmit` fails on the facade options — that is expected,
     the type has to move first. Note it and continue; full red-green is not
     available for a change that is partly a type change.
2. **Generalise the core** — `src/lib/WebSocketClient.ts`
   - Change: internal `type SendArgs<TSend>`; `IWebSocketClientAdapter`,
     `WebSocketClientAdapter<TClient, TSend = void>`, `IWebSocketClient`,
     `WebSocketClient<TClient, TSend = void>`, `send`, `sendAsync`;
     `WindowWebSocketClientAdapter extends WebSocketClientAdapter<WebSocket>`
     (unchanged body).
   - Verify: `npx tsc --noEmit` clean; `npm test` (unit tier, `FakeAdapter`
     untouched) passes; worker entrypoints and `src/main.ts` unchanged (AC7).
3. **Implement the STOMP send** — `src/lib/protocols/stomp/StompWebSocketClientAdapter.ts`
   - Change: export `StompSendOptions`; extend
     `WebSocketClientAdapter<StompClient, StompSendOptions>`; `send(data, options)`
     publishes to `options.destination` with `options.headers ?? { 'content-type':
     'application/json' }`; keep `publish()` for the array-topic delegation and
     have it call `send` per destination.
   - Verify: `npm run test:integration` — AC3 test still red (facade not wired).
4. **Wire the facade** — `src/lib/protocols/stomp/StompWebSocketClient.ts`
   - Change: `StompWebSocketClientOptions`; pass `plugins`/`logger` to `super`;
     delete the `connect()`/`disconnect()` overrides; `publishAsync(topic, body)`
     runs `sendAsync` per destination; `publish` is the fire-and-forget mirror.
   - Verify: `npm run test:integration` green, including the two new tests.
5. **Prove the tests bite** — no file change
   - Verify: remove the `super` options, then the `onBeforeSend` forwarding; each
     removal must turn exactly the matching new test red. Restore by copying the
     file back, never `git checkout` (uncommitted work is at risk).
6. **Docs and barrel** — `README.md`, `src/lib/protocols/stomp/index.ts`, `AGENTS.md`
   - Change: README plugin section states the hook order applies to every
     transport and that pub/sub protocols carry send options; barrel exports
     `StompWebSocketClientOptions`; AGENTS.md `WHERE TO LOOK` row for the send
     contract.
   - Verify: `npm run check`.
7. **Commit** — message: `feat: carry protocol send options through the plugin pipeline`
   - Single commit straight to `main` (owner's convergence rule), then
     `git fetch --prune`.

## Files touched

| File | New / modified | Why |
|------|----------------|-----|
| `src/lib/WebSocketClient.ts` | modified | `TSend` parameter, `SendArgs`, `send`/`sendAsync` forwarding |
| `src/lib/protocols/stomp/StompWebSocketClientAdapter.ts` | modified | `StompSendOptions`, real `send()`, publish delegation |
| `src/lib/protocols/stomp/StompWebSocketClient.ts` | modified | options type, `super` options, overrides deleted, `publishAsync` |
| `src/lib/protocols/stomp/index.ts` | modified | export the facade options type |
| `src/lib/protocols/stomp/StompWebSocketClient.integration.test.ts` | modified | AC1 + AC3 contract tests |
| `README.md`, `AGENTS.md` | modified | AC5, navigation |
| `docs/sdlc/stomp-facade-plugins/plan.md` | new | this plan; `Deviations` filled at the end |

Not touched, by design: `src/lib/workers/*`, `src/main.ts`,
`src/lib/WebSocketClient.test.ts`, `src/lib/WebSocketClient.integration.test.ts`.
If any of them needs an edit, `TSend`'s default is wrong and step 2 is not done.

## Verification

```bash
npx tsc --noEmit
npm run check
npm test
npm run test:integration
colima start && npm run stomp:up && npm run test:integration:broker && npm run stomp:down
npm run build
```

Expected: unit 6 passed; integration 20 passed / 9 skipped without a broker URL;
29 passed with one (18 + 2 new, times the two tiers, plus the two frame tests);
`biome check` exit 0; build succeeds.

## Rollback

`git revert <commit>` restores everything — the type parameter has a default, so
reverting cannot break native callers. No config or dependency change is
involved, so nothing survives the revert.

## Deviations

(filled during implementation)
