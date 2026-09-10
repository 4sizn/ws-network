# Migration: ws-network → ws-pack

- **Deprecated:** 2026-09-10
- **Successor:** [ws-pack](https://github.com/4sizn/ws-pack)
- **Last commit here:** `2068425 fix(demo): let the STOMP demo send real broker credentials (#18)`

This repository is frozen. It is kept for history and for the material listed
under "Not carried over" below, which a future ws-pack change may want to pull
back in. Nothing new should be built here.

## Lineage

Three repositories have held this library. Each was a restart, not a refactor:

| Generation | Repository | Active | Ended as |
|---|---|---|---|
| 1 | `stomp-network` (`@4sizn/stomp` v1.0.6) | – 2025-12-16 | Deprecated 2026-09-10 |
| 2 | **ws-network** (this repo) | 2026-03-02 – 2026-09-10 | Deprecated 2026-09-10 |
| 3 | `ws-pack` | 2026-09-10 – | Maintained |

Generation 2 did not inherit generation 1's code, and generation 3 did not
inherit generation 2's. ws-pack revives the layered design of `stomp-network`
(controller, reconnect policy, plugin base class, error types) with the type
discipline this repository developed. Because the jump skipped this tree, the
verification work below did not travel with it.

## What ws-pack already does better

- **Three layers with one direction.** `Client → Controller → Adapter`. The
  client holds only a controller and never learns the adapter's concrete type.
  This repository's facade downcast instead:
  `private get adapter() { return this.client as StompWebSocketClientAdapter }`.
- **Reconnect is a first-class concern.** `core/Reconnect.ts`, `ReconnectInfo`,
  `reconnectAttempt$`, `maxReconnectReached$`, `ReconnectTimeMode`. This
  repository had no reconnect policy and no way to observe one.
- **Connection state is modelled.** `ConnectionState` plus `connectionState$`
  and `connectionChanges$`. Here, state was implicit in the socket's
  `readyState`.
- **Subscriptions survive reconnect.** `StompWebSocketClient.subscribe()`
  returns an `Observable<IMessage>` that re-subscribes after a reconnect and
  tears the STOMP subscription down when unsubscribed. Here, subscriptions were
  a `Record<string, StompSubscription>` on the adapter with no recovery.
- **A narrow barrel.** `src/lib/index.ts` exports constructors, options types
  and the plugin injection contract — not the internals.

## Not carried over — read this before deleting anything

These are the parts of this repository that ws-pack does not have as of
2026-09-10. They are the cost of the migration, recorded so the cost is a
decision rather than a surprise.

1. **The test suite — 1,056 lines. ws-pack has no tests at all.**
   - `src/lib/WebSocketClient.test.ts` (224) — unit tier, no sockets.
   - `src/lib/WebSocketClient.integration.test.ts` (201) — `WindowWebSocketClient`
     against a real in-process echo server on an ephemeral port: connect,
     `status()`, listeners and `messages$`, plugin hook order with a transformed
     payload, close from either side, error path on a refused port.
   - `src/lib/protocols/stomp/StompWebSocketClient.integration.test.ts` (631) —
     `StompWebSocketClient` against a minimal real STOMP 1.2 broker: CONNECT
     handshake with `connectHeaders`, subscribe/publish round-trip, array
     topics, close, plugin hooks through the composed adapter.
   - Both servers are real servers declared inside the test file that uses
     them, not test doubles. The two-tier split lives in `vitest.config.ts`,
     and `docker-compose.test.yml` adds a real-broker tier against RabbitMQ.
     ws-pack carries a `docker-compose.test.yml` but nothing that runs against
     it.
2. **The CI gate.** `.github/workflows/ci.yml` pins Node from `.nvmrc`, then
   runs Biome lint, a separate format check (`biome lint` does not check
   formatting), the unit tier, the in-process integration tier, and the real
   RabbitMQ Web-STOMP tier — the last because the in-process broker is a
   hand-written frame implementation and proves nothing about interoperability.
   ws-pack has Biome configured but no workflow at all.
3. **The outbound plugin pipeline.** This repository routes sends through
   `onBeforeSend` (which may transform the payload) and `onAfterSend`, carries
   protocol send options through that pipeline (`StompSendOptions`,
   `undefined` as the no-options sentinel), and runs the hooks once for an array
   of destinations while delivering the transformed body to each. ws-pack's
   `AbstractPlugin` has `onAttach`/`onDetach`, the four connect/disconnect
   hooks, and `onError` — there is no `onBeforeSend`, `onAfterSend` or
   `onMessage` hook, so a plugin there cannot see or change traffic.
4. **Worker transports — 193 lines.** `src/lib/workers/socket-workers.ts` (80,
   dedicated worker) and `src/lib/workers/shared-socket-workers.ts` (113,
   shared worker), with a typed envelope (`CONNECTED`/`MESSAGE`/`ERROR`/
   `CLOSED`/`PONG`), a legacy-string compatibility path, and URL injection via
   `?wsUrl=` or `VITE_WS_URL`. ws-pack's `src/lib/worker/socket-worker.ts` is
   an empty file. Note that these workers were never wired into this
   repository's core client either — they are demo-only, and untested.
5. **Listener lifetime management.** Every `on*` registration here returns an
   `Unsubscribe` and accepts an `AbortSignal`, and plugin hook failures are
   caught per plugin so one bad plugin cannot break the pipeline. ws-pack
   exposes RxJS streams only; check that the equivalent guarantees exist before
   relying on them.
6. **The SDLC records.** `docs/sdlc/stomp-facade-plugins/{intent,spec,plan}.md`
   states the facade/plugin problem, the accepted contract, and the non-goals.
   The reasoning is still valid for ws-pack's facade.

## Fixes made here that ws-pack should be checked against

Four STOMP defects were found and fixed in this repository in September 2026.
Each was a real behavioural bug, not a typo, and each is easy to reintroduce in
a rewrite. Verify ws-pack's adapter against all four:

| # | Defect | Commit |
|---|---|---|
| 12 | Inbound messages never reached the core client's `onMessage`/`messages$` | `ccc6343` |
| 13 | `unsubscribe()` did not send UNSUBSCRIBE, so the broker kept delivering | `13fe26a` |
| 14 | `status()` threw instead of reporting the socket state | `a2617fa` |
| 15 | A second `connect()` orphaned the previous client instead of being idempotent | `cbe312f` |

`status()` on a STOMP client reports the underlying socket state — the same
meaning it has on the native client — not the STOMP session state, which
`onConnect`/`onClose` track. Keep that distinction in ws-pack.

## Open branches and their disposition

Counts are against `main` at `2068425`, as `ahead/behind`.

| Branch | Position | Contents | Disposition |
|---|---|---|---|
| `feat/mqtt-protocol` | 15 / 3 | MQTT adapter, client, topic matcher and tests (~4,473 lines added) plus `docs/architecture.md` (276), a 192-line README section, `docs/sdlc/mqtt-protocol/{intent,spec,plan,review}.md`, and a split `vitest.integration.config.ts` | **Unmerged. Not migrated.** ws-pack has a `MqttWebSocketClient` whose adapter is still a `TODO`, so this branch is the only working MQTT implementation that exists. Port it to ws-pack's controller layer or accept losing it. |
| `feat/mqtt-worker` | 15 / 3 | Same tip as `feat/mqtt-protocol` | **Unmerged.** Duplicate; resolve together with the branch above. |
| `4sizn/stomp-connect-rejection` | 1 / 0 | `fix(stomp): settle connect() when the attempt fails` — `connect()` never settles against a dead broker | **Unmerged.** A known defect with a written fix. Re-verify the same case in ws-pack before discarding. |

The MQTT work is the single largest unmigrated asset in this repository: about
4,473 lines of implementation, tests and specification that no other repository
holds.

## If you need something out of this tree

Read the file here, then reimplement it against ws-pack's
`Client → Controller → Adapter` layering. Do not copy files across: this
repository's `WebSocketClient` owns the plugin pipeline and the listener
registry directly, which is exactly the responsibility ws-pack moved into the
controller.
