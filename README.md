# ws-network

Native browser WebSocket client with an adapter-based design.

Notes:
- This repo is currently `private: true` (see `package.json`), so examples below are repo-local.
- STOMP support is opt-in and isolated under `src/lib/protocols/stomp/`.

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

client.onMessage((msg) => {
  console.log('message:', msg);
});

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

## Plugins

`IWebSocketPlugin` hooks run in this order:
- connect: `onBeforeConnect` -> adapter connect -> `onAfterConnect`
- send: `onBeforeSend` (transform chain) -> adapter send -> `onAfterSend`
- disconnect: `onBeforeDisconnect` -> adapter disconnect -> `onAfterDisconnect`
- inbound message: plugin `onMessage` hooks -> user `onMessage` callback

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
