# Spec: wire plugins through the STOMP facade

- **Intent:** `docs/sdlc/stomp-facade-plugins/intent.md`
- **Date:** 2026-09-09
- **Status:** accepted
- **Owner:** 4sizn

## Scope

Two changes that together make the plugin contract protocol-independent.

1. The core's send contract is generalised so a protocol can express what a
   send needs: `WebSocketClientAdapter<TClient, TSend = void>` and
   `WebSocketClient<TClient, TSend = void>`, with `send`/`sendAsync` taking
   `...args: SendArgs<TSend>`. Native call sites do not change, because
   `TSend` defaults to `void`.
2. `StompWebSocketClient` accepts `plugins` and `logger` and passes them to
   `WebSocketClient`, and its `connect()`/`disconnect()` overrides are removed
   so the core hook order runs. `publish(topic, body)` becomes a facade alias
   for `sendAsync(body, { destination: topic })`, so it runs
   `onBeforeSend` → adapter send → `onAfterSend` like every other transport.

Contract tests cover the hook order and the transformed body on both the
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
- [ ] AC3: `publish()` runs `onBeforeSend`, the broker receives the transformed
      body, and `onAfterSend` runs (contract test, both brokers)
- [ ] AC6: `stompClient.send('x')` fails to compile without send options, and
      `stompAdapter.send(data, { destination })` publishes — the adapter's
      `send()` no longer throws
- [ ] AC7: native call sites are untouched — `WindowWebSocketClient.send('x')`,
      both worker entrypoints and `src/main.ts` compile unchanged
- [ ] AC4: `npm run check`, `npx tsc --noEmit`, `npm test`,
      `npm run test:integration` and `npm run test:integration:broker` pass
- [ ] AC5: README's plugin section states which hooks apply to pub/sub protocols

## Design

The send pipeline stays the only outbound path. The destination rides in a
type parameter, so the core still has no concept of a destination:

```ts
type SendArgs<TSend> = TSend extends void ? [] : [options: TSend];

export abstract class WebSocketClientAdapter<TClient, TSend = void> {
  public abstract send(data: string, ...args: SendArgs<TSend>): void;
}

export class WebSocketClient<TClient = unknown, TSend = void> {
  send(message: string, ...args: SendArgs<TSend>): void;
  sendAsync(message: string, ...args: SendArgs<TSend>): Promise<void>;
}

export interface StompSendOptions {
  destination: string;
  headers?: Record<string, string>;
}
```

`StompWebSocketClientAdapter extends WebSocketClientAdapter<StompClient,
StompSendOptions>` implements `send(data, options)` with the STOMP publish, so
the adapter's `send()` stops throwing. Verified against TypeScript 5.9: with
`TSend = void` native calls stay `send('x')`, and for STOMP
`send('x')` without options fails to compile.

Facade shape:

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

```ts
publish(topic: string | string[], message: string): void;      // fire-and-forget, mirrors send()
publishAsync(topic: string | string[], message: string): Promise<void>;
```

Array topics run the hooks once and deliver the transformed body to each
destination.

## Approaches considered

| Approach | Trade-off | Verdict |
|----------|-----------|---------|
| (d) Generalise the send contract with `TSend` (chosen) | Touches the core's generic signature and every adapter declaration, but native call sites and worker entrypoints are unchanged, the hook pipeline stays single, and STOMP's `send()` stops throwing. Reverts cleanly because the parameter has a default | **chosen** — the requirement is that `onBeforeSend`/`onAfterSend` behave as intended regardless of protocol, and this is the only option where they are not a special case |
| (a) Core extension point: `protected runSendPipeline(message, deliver)` | Smaller diff, but the facade reaches around the send contract instead of satisfying it, and `StompWebSocketClientAdapter.send()` keeps throwing | rejected — leaves two outbound paths in the core |
| (b) Document send hooks as native-only | Zero core change, but it contradicts the requirement: the hooks would not run for STOMP at all | rejected — the owner wants the intended before/after-send behaviour everywhere |
| (c) Destination-bound sender: `to(topic)` returns a `WebSocketClient` over a tiny adapter whose `send(data)` publishes to that topic | No core change and the core contract fits exactly. Costs an extra adapter class, an object per destination, and a send-only client whose inbound callbacks are unused | rejected — cheapest in policy terms, most surprising in use |
| `send()` overloading (`send(body)` / `send(destination, body)`) | Not assignable to `IWebSocketClient.send` unless the second parameter is optional, and then one-argument calls through the interface cannot be distinguished at runtime from a destination-only call | rejected — unsound, and it does not solve the hook problem |

## Constraint check

- [x] Strict TS clean — no new unused locals/params; `publishAsync` returns `Promise<void>`
- [x] Biome format — CI now gates it (`npm run check`)
- [x] No hardcoded URLs or secrets — options stay injected
- [x] `src/lib/WebSocketClient.ts` stays native-WebSocket-only — the core gains
      a type parameter, not a protocol. It imports nothing from
      `src/lib/protocols/`, and `TSend` is opaque to it: the core forwards the
      argument and never inspects it. `WindowWebSocketClientAdapter` keeps
      `TSend = void`
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

- **`TSend` turns out to be the wrong shape for MQTT** (topic + qos + retain).
  Cheapest signal: declare the MQTT adapter's `TSend` while merging
  `feat/mqtt-protocol` and see whether anything but the options interface has to
  change
- **A caller holding `IWebSocketClient` loses the ability to send generically.**
  With `TSend` defaulting to `void`, `IWebSocketClient` (no argument) still
  describes native clients; a STOMP client is not assignable to it for `send`.
  Signal: any internal code that stores a client as the bare interface — today
  only `src/main.ts`, which uses a concrete type
- **`disconnect()` becomes deferred** — the core version awaits hooks before the
  adapter closes, so `disconnect(); status()` reads OPEN for a microtask. Same as
  the native client. Signal: the existing close contract test, which waits rather
  than asserting synchronously
- **Probe messages in the outbound test** could be transformed by a test plugin
  and break subscription readiness detection. Signal: the test's own
  `awaitSubscription` timing out
