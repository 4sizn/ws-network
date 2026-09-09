# ws-network

Native browser WebSocket client with an adapter-based design.

Notes:
- This repo is currently `private: true` (see `package.json`), so examples below are repo-local.
- STOMP support is opt-in and isolated under `src/lib/protocols/stomp/`.
- MQTT support is opt-in under `src/lib/protocols/mqtt/` and takes the `mqtt`
  module by injection, so this repo has no `mqtt` runtime dependency.

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

## MQTT Usage (injected module)

This repo never imports `mqtt`. You pass `mqtt.connect` in, so you pin the
version and MQTT code stays out of bundles that do not use it.

```ts
import { connect } from 'mqtt'; // you own this dependency
import { MqttWebSocketClient } from './src/lib/protocols/mqtt';

const client = new MqttWebSocketClient({
  brokerURL: 'wss://broker.example.com:8884/mqtt',
  connect,
  connectOptions: { clientId: 'web-1', clean: true },
});

// The callback receives the receiving topic as a second argument, so a
// wildcard subscriber can tell messages apart.
client.subscribe('sensor/+/temp', (message, topic) => {
  console.log(topic, message);
});

client.publish('sensor/a/temp', '21.5', { qos: 1, retain: true });

await client.connect();
```

Behavior worth knowing:

- Subscribing before `connect()` is kept and registered once the connection is
  established, not dropped.
- `connect()` rejects if the broker errors before the connection is
  established, and calling it twice returns the same promise.
- Subscribing the same filter twice keeps both callbacks; `unsubscribe(filter)`
  releases the filter and tells the broker.
- Failed subscribe/unsubscribe/publish operations surface through `onError`.
- Shared subscriptions (`$share/...`) are not supported and are rejected
  through `onError` rather than silently receiving nothing.
- `send()` throws: MQTT needs a topic, so use `publish()`.

## Testing tiers

Three independent tiers. Each proves something the others cannot.

| Tier | Command | Broker | Proves |
|------|---------|--------|--------|
| Unit | `npm test` | none (in-file fake) | adapter/facade logic, offline, ~0.4s |
| Integration | `npm run test:integration` | in-process `aedes` over TCP | real MQTT semantics against a real broker and the real `mqtt` client |
| Manual | `npm run dev` + a real broker | your own, over WebSocket | the browser WebSocket transport end to end |

`npm run test:all` runs the first two.

### Unit tier

Uses a `FakeClient` declared inside the test file (the same pattern as
`FakeAdapter` in `src/lib/WebSocketClient.test.ts`). No network, no broker.

### Integration tier

Starts an in-process [aedes](https://github.com/moscajs/aedes) broker on an
ephemeral TCP port and injects the real `mqtt` module. It covers what a fake
cannot: that `isTopicMatch` agrees with a real broker's wildcard matching
(our matcher is a reimplementation of broker-side logic, so unit tests can
never catch a divergence), that `qos`/`retain` options take effect, that a
subscription made before `connect()` really reaches the broker, and that
`connect()` rejects instead of hanging when no broker answers.

It does **not** cover the WebSocket transport — the default broker is TCP.
Point it at any broker to cover that too:

```bash
MQTT_TEST_BROKER_URL=ws://127.0.0.1:8083/mqtt npm run test:integration
```

### Manual tier (browser over WebSocket)

The demo app loads MQTT lazily, so the adapter and `mqtt` itself stay out of
the main bundle unless `VITE_MQTT_BROKER_URL` is set.

1) Run a broker with a WebSocket listener. With Mosquitto:

```bash
# mosquitto-ws.conf
listener 1883
listener 8083
protocol websockets
allow_anonymous true
```

```bash
mosquitto -c mosquitto-ws.conf
```

2) Start the demo against it:

```bash
VITE_MQTT_BROKER_URL=ws://127.0.0.1:8083/mqtt npm run dev
```

The demo subscribes to `demo/chat` and shows `[topic] message` for anything it
receives.

## Plugins

`IWebSocketPlugin` hooks run in this order:
- connect: `onBeforeConnect` -> adapter connect -> `onAfterConnect`
- send: `onBeforeSend` (transform chain) -> adapter send -> `onAfterSend`
- disconnect: `onBeforeDisconnect` -> adapter disconnect -> `onAfterDisconnect`
- inbound message: plugin `onMessage` hooks -> user listeners -> `messages$`

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
