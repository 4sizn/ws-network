# ws-network

> [!WARNING]
> **DEPRECATED — 2026-09-10. This repository is no longer maintained.**
>
> Use [**ws-pack**](https://github.com/4sizn/ws-pack) instead. It is the
> maintained successor and carries the controller-level reconnect, subscription
> and plugin design that this repository never grew.
>
> No further features, fixes or releases will land here. The branches that were
> still open when this repository was frozen are listed, with their disposition,
> in [`docs/MIGRATION.md`](docs/MIGRATION.md) — read that before you copy
> anything out of this tree.
>
> What ws-pack does **not** yet carry from here, and what you therefore lose by
> migrating, is recorded in the same document. The largest item is the test
> suite: this repository has 1,056 lines of unit and integration tests plus a CI
> gate; ws-pack has neither yet.


Native browser WebSocket client with an adapter-based design.

Notes:
- This repo is currently `private: true` (see `package.json`), so examples below are repo-local.
- STOMP support is opt-in and isolated under `src/lib/protocols/stomp/`.

## Tests

Two tiers, split by `vitest.config.ts` projects:

```bash
npm test                  # unit tier: no sockets, src/**/*.test.ts
npm run test:integration  # integration tier: src/**/*.integration.test.ts
```

The integration tier starts a real server in-process on an ephemeral port
(`ws` on the server side, the platform `WebSocket` on the client side) and
drives the public client API against it:

- `src/lib/WebSocketClient.integration.test.ts` — `WindowWebSocketClient`
  against an echo server: connect, `status()`, listeners and `messages$`,
  plugin hook order with a transformed payload, close from either side, and
  the error path on a refused port.
- `src/lib/protocols/stomp/StompWebSocketClient.integration.test.ts` —
  `StompWebSocketClient` against a minimal STOMP 1.2 broker: the CONNECT
  handshake with `connectHeaders`, subscribe/publish round-trip, array topics,
  close, and plugin hooks through the adapter composed with `WebSocketClient`.

Each server is declared inside the test file that uses it; they are real
servers, not test doubles.

No STOMP contract test is `it.fails` any more: the three defects they pinned
(inbound messages not reaching the core `onMessage`/`messages$`, `unsubscribe()`
not stopping broker delivery, `status()` throwing) are fixed. `status()` on a
STOMP client reports the underlying socket state, the same meaning it has on the
native client — not the STOMP session state, which `onConnect`/`onClose` track.

### Real broker tier (docker)

The in-process STOMP broker is written in this repo, so it cannot prove
interoperability — a shared misreading of the spec would pass. The STOMP tests
are therefore a contract (`defineStompContract`) that runs twice: against the
in-process broker always, and against RabbitMQ Web-STOMP when
`WS_NETWORK_STOMP_URL` is set. Without that variable the real-broker block is
skipped, so the tier still runs on machines without docker.

Any Docker-compatible runtime works; this repo was verified with colima:

```bash
brew install colima docker docker-compose   # once
colima start                                # once per boot
```

```bash
npm run stomp:up                  # RabbitMQ Web-STOMP on ws://127.0.0.1:15674/ws
npm run test:integration:broker   # same contract against the real broker
npm run stomp:down
```

`docker-compose.test.yml` enables the `rabbitmq_web_stomp` plugin and creates a
`test`/`test` account, because RabbitMQ's `guest` account is rejected from
outside the container. To point the contract at a different broker, set
`WS_NETWORK_STOMP_URL` to it; the credentials are `test`/`test` in the test
file.

## Demo

1) Start the Node WebSocket echo server:

```bash
cd server
npm ci
npm run dev
```

2) Start the Vite demo app (root):

```bash
VITE_WS_URL=ws://127.0.0.1:8010 npm run dev
```

### STOMP demo

The demo app's STOMP path takes `VITE_STOMP_BROKER_URL`, and the broker from
"Real broker tier" below serves it:

```bash
npm run stomp:up
VITE_STOMP_BROKER_URL=ws://127.0.0.1:15674/ws \
VITE_STOMP_LOGIN=test VITE_STOMP_PASSCODE=test npm run dev
```

`VITE_STOMP_BROKER_URL` takes precedence over `VITE_WS_URL` in the demo app.

`VITE_STOMP_LOGIN` and `VITE_STOMP_PASSCODE` become the CONNECT credentials.
Both must be set, or the demo sends no credentials and `@stomp/stompjs` falls
back to `guest`/`guest`, which RabbitMQ refuses from outside the container
(`Access refused for user 'guest'`). The compose broker's account is
`test`/`test`.

The demo's message form publishes to `/topic/chat` when the client is a STOMP
client, and calls `send()` for the native one.

## Native WebSocket Usage

### Convenience (environment-specific client)

```ts
import {
  WindowWebSocketClient,
  LoggingPlugin,
  type WsNetworkLogger,
} from './src/lib/WebSocketClient';

const logger: WsNetworkLogger = console;

const client = new WindowWebSocketClient({
  url: 'ws://127.0.0.1:8010',
  plugins: [new LoggingPlugin(logger)],
  logger,
});

client.onConnect(() => {
  client.send('hello');
});

const unsubscribeMessage = client.onMessage((msg) => {
  console.log('message:', msg);
});

const controller = new AbortController();
client.onError(
  (error) => {
    console.error(error.message);
  },
  { signal: controller.signal },
);

// later
unsubscribeMessage();
controller.abort();

await client.connect();
```

### Composition (adapter + base client)

```ts
import {
  WebSocketClient,
  WindowWebSocketClientAdapter,
  LoggingPlugin,
  type WsNetworkLogger,
} from './src/lib/WebSocketClient';

const logger: WsNetworkLogger = console;

const adapter = new WindowWebSocketClientAdapter({
  url: 'ws://127.0.0.1:8010',
  logger,
});

const client = new WebSocketClient(adapter, {
  plugins: [new LoggingPlugin(logger)],
  logger,
});

client.onMessage((msg) => {
  console.log('message:', msg);
});

await client.connect();
client.send('hello');
```

### RxJS event streams

`WebSocketClient` exposes hot multicast observables that are emitted from the
same underlying adapter connection.

```ts
import { filter } from 'rxjs';

const subscription = client.messages$
  .pipe(filter((msg) => msg.length > 0))
  .subscribe((msg) => {
    console.log('stream message:', msg);
  });

const connectionSubscription = client.connected$.subscribe(() => {
  console.log('connected');
});

// later
subscription.unsubscribe();
connectionSubscription.unsubscribe();
```

## Plugins

`IWebSocketPlugin` hooks run in this order, on every transport:
- connect: `onBeforeConnect` -> adapter connect -> `onAfterConnect`
- send: `onBeforeSend` (transform chain) -> adapter send -> `onAfterSend`
- disconnect: `onBeforeDisconnect` -> adapter disconnect -> `onAfterDisconnect`
- inbound message: plugin `onMessage` hooks -> user listeners -> `messages$`

### Send options

A send carries whatever the protocol requires, in a type parameter the core
never inspects:

```ts
class WebSocketClientAdapter<TClient, TSend = undefined> {
  abstract send(data: string, ...args: SendArgs<TSend>): void;
}
```

`TSend` defaults to `undefined`, so native sends stay `client.send('hello')`. STOMP
declares `TSend = StompSendOptions`, which makes the destination part of the
call and part of the send pipeline:

```ts
stompClient.send('hello', { destination: '/topic/chat' });
stompClient.publish('/topic/chat', 'hello');   // facade alias for the line above
await stompClient.publishAsync('/topic/chat', 'hello');
```

Omitting the options on a STOMP client is a compile error, and `publish()` runs
`onBeforeSend`/`onAfterSend` like any other send. An array of destinations runs
the hooks once and delivers the transformed body to each.

## Workers

Worker entrypoints:
- Dedicated worker: `src/lib/workers/socket-workers.ts`
- Shared worker: `src/lib/workers/shared-socket-workers.ts`

Typed outbound envelope (worker -> main thread):
- `{ type: 'CONNECTED' }`
- `{ type: 'MESSAGE', data: string }`
- `{ type: 'ERROR', error: string }`
- `{ type: 'CLOSED' }`
- `{ type: 'PONG' }`

Inbound (main thread -> worker) supports:
- legacy `'ping'` or typed `{ type: 'PING' }` -> replies `{ type: 'PONG' }`
- typed `{ type: 'SEND', data: string }` or legacy string -> send

URL injection for workers:
- Pass `?wsUrl=...` in the worker URL, or set `VITE_WS_URL`.
