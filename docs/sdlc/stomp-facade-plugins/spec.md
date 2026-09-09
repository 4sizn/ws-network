# Spec: wire plugins through the STOMP facade

- **Intent:** `docs/sdlc/stomp-facade-plugins/intent.md`
- **Date:** 2026-09-09
- **Status:** draft
- **Owner:** 4sizn

## Scope

`StompWebSocketClient` accepts `plugins` and `logger` and passes them to
`WebSocketClient`; the `connect()`/`disconnect()` overrides are removed so the
core hook order runs. The outbound path (`publish()`) gets an explicit,
documented answer — either it runs the send hooks or it is documented as never
running them. Contract tests cover whichever answer is chosen, on both the
in-process broker and RabbitMQ Web-STOMP.

## Out of scope

- `connect()` called twice orphaning the previous `StompClient` (separate intent)
- `connect()` never settling when the broker is unreachable (separate intent)
- Narrowing the STOMP barrel (dropping the adapter pair) — separate commit, it
  is a public-surface decision
- `src/main.ts` demo wiring
- Adding a `logger` to `StompWebSocketClientAdapterOptions`; nothing in the
  adapter logs yet, so the field would be dead

## Acceptance criteria

- [ ] AC1: `new StompWebSocketClient({ brokerURL, plugins: [p] })` type-checks
      and runs `onBeforeConnect` → connect → `onAfterConnect`, then
      `onBeforeDisconnect` → disconnect → `onAfterDisconnect`, in that order
      (contract test, both brokers)
- [ ] AC2: the facade no longer declares `connect()` or `disconnect()`
- [ ] AC3: the outbound behaviour is asserted by a test, not left implicit —
      either "publish runs `onBeforeSend` and delivers the transformed body" or
      "publish does not run send hooks, and `send()` throws pointing at
      `publish()`"
- [ ] AC4: `npm run check`, `npx tsc --noEmit`, `npm test`,
      `npm run test:integration` and `npm run test:integration:broker` pass
- [ ] AC5: README's plugin section states which hooks apply to pub/sub protocols

## Design

Common to every approach:

```ts
export type StompWebSocketClientOptions = StompWebSocketClientAdapterOptions &
  WebSocketClientOptions;

constructor(options: StompWebSocketClientOptions) {
  super(new StompWebSocketClientAdapter(options), {
    plugins: options.plugins,
    logger: options.logger,
  });
}
// connect()/disconnect() overrides deleted — the core versions run the hooks
```

The open question is the outbound path. The core's send pipeline is
`sendAsync(message)`; STOMP's is `publish(destination, body)`. The core contract
has no destination, and `StompWebSocketClientAdapter.send()` throws.

## Approaches considered

| Approach | Trade-off | Verdict |
|----------|-----------|---------|
| (a) Core extension point: `protected runSendPipeline(message, deliver)`; facade adds `publish`/`publishAsync` that pass a `deliver` closure holding the destination | Core gains a subclass contract that is hard to remove later; the core still only sees a payload string, so no protocol concept leaks. ~22 lines | **recommended** — `feat/mqtt-protocol` is unmerged work for a second pub/sub protocol, and it would reuse the same point instead of repeating the exception |
| (b) Document send hooks as native-only; make `send()`'s error point at `publish()` | Zero core change, zero new surface, easily reversed. But plugin semantics differ per protocol, and every future pub/sub protocol repeats the exception | rejected unless MQTT is dropped |
| (c) Destination-bound sender: `to(topic)` returns a `WebSocketClient` over a tiny adapter whose `send(data)` publishes to that topic | No core change and the core contract fits exactly. Costs an extra adapter class, an object per destination, and a send-only client whose inbound callbacks are unused | rejected — cheapest in policy terms, most surprising in use |
| `send()` overloading (`send(body)` / `send(destination, body)`) | Not assignable to `IWebSocketClient.send` unless the second parameter is optional, and then one-argument calls through the interface cannot be distinguished at runtime from a destination-only call | rejected — unsound, and it does not solve the hook problem |

## Constraint check

- [x] Strict TS clean — no new unused locals/params; `publishAsync` returns `Promise<void>`
- [x] Biome format — CI now gates it (`npm run check`)
- [x] No hardcoded URLs or secrets — options stay injected
- [ ] `src/lib/WebSocketClient.ts` stays native-WebSocket-only — **flag for the
      owner.** (a) adds a `protected` method to the core for protocol subclasses
      to reuse. It imports no protocol and knows no destination, so the letter of
      the rule holds; the spirit ("the core does not bend for protocols") is what
      the owner is being asked to accept. (b) and (c) need no core change
- [x] Protocol code isolated under `src/lib/protocols/stomp/`
- [x] Third-party module injected — `StompWebSocketClientAdapter` still accepts a
      `StompClient` instance in its second parameter
- [x] Worker payloads untouched

## Test strategy

- Contract (`defineStompContract`) gains a facade-plugin test for AC1 and an
  outbound test for AC3; both tiers run them, so RabbitMQ confirms the hook order
  is not an artefact of the in-process broker
- Unit tier unchanged — `FakeAdapter` already covers the core hook order
- Deliberately untested: `logger` output (no assertions on log text)
- Regression signal: remove the fix and exactly the new tests must fail. That
  check is part of the build stage, as it was for #12–#14

## Risks

- **(a) locks a core extension point.** Cheapest signal it was wrong: the second
  protocol (MQTT) needs a different shape when it lands on `feat/mqtt-protocol`
- **`disconnect()` becomes deferred** — the core version awaits hooks before the
  adapter closes, so `disconnect(); status()` reads OPEN for a microtask. Same as
  the native client. Signal: the existing close contract test, which waits rather
  than asserting synchronously
- **Probe messages in the outbound test** could be transformed by a test plugin
  and break subscription readiness detection. Signal: the test's own
  `awaitSubscription` timing out
