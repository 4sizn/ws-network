# Learnings

## Context scan (2026-03-02)

- STOMP code lives in `src/lib/WebSocketClient.ts`:
  - `import { Client as StompClient, StompSubscription } from '@stomp/stompjs'`
  - `export class StompWebSocketClientAdapter` and `export class StompWebSocketClient`
- Native WebSocket code lives in `src/lib/WebSocketClient.ts`:
  - `export class WindowWebSocketClientAdapter` and `export class WindowWebSocketClient`
- Current public surface issue for "native WebSocket target":
  - `WebSocketClient` base currently exposes STOMP-only methods `publish/subscribe/unsubscribe/isSubscribed` by casting its adapter (`src/lib/WebSocketClient.ts` around the `WebSocketClient` class).
  - `src/main.ts` calls `client.publish(...)` on a generic `WebSocketClient` when STOMP adapter is used.
- Workers use native WebSocket client wrapper:
  - `src/lib/workers/socket-workers.ts` and `src/lib/workers/shared-socket-workers.ts` import `WindowWebSocketClient`.

## Refactor outcome (2026-03-02)

- `src/lib/WebSocketClient.ts` is now native-only and no longer imports `@stomp/stompjs`.
- STOMP code moved to opt-in protocol module under `src/lib/protocols/stomp/`:
  - `StompWebSocketClientAdapter.ts` contains STOMP adapter + options type.
  - `StompWebSocketClient.ts` provides STOMP client wrapper with publish/subscribe API.
  - `index.ts` re-exports STOMP module entrypoints.
- `src/main.ts` now imports `StompWebSocketClient` from `src/lib/protocols/stomp` instead of STOMP adapter from the native client module.
