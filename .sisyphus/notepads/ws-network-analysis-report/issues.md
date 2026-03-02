# Issues

## 2026-03-02 - WebSocket caveat validation (source-only)

- Hardcoded STOMP broker URL: `src/lib/WebSocketClient.ts:182` -> `brokerURL: "wss://stapapp.rfice.com/websocket/connect"`.
- Hardcoded native WebSocket URL: `src/lib/WebSocketClient.ts:257` -> `new WebSocket("ws://localhost:8010")`.
- Embedded auth secret risk (hardcoded credentials in client code):
  - JWT-like bearer token in `connectHeaders.authorization` at `src/lib/WebSocketClient.ts:187-188`.
  - Device key in `connectHeaders["device-key"]` at `src/lib/WebSocketClient.ts:190-191`.
  - Additional static headers in same block (`device-type`, `app-version`) at `src/lib/WebSocketClient.ts:189`, `src/lib/WebSocketClient.ts:192`.

### Reconnect / heartbeat evidence

- STOMP adapter (`StompWebSocketClientAdapter.connect`):
  - `heartbeatIncoming: 0` at `src/lib/WebSocketClient.ts:183`.
  - `heartbeatOutgoing: 0` at `src/lib/WebSocketClient.ts:184`.
  - `reconnectDelay: 5000` at `src/lib/WebSocketClient.ts:185`.
  - Conclusion: reconnect is configured; heartbeat is explicitly disabled.

- Native adapter (`WindowWebSocketClientAdapter.connect`):
  - No `reconnectDelay` or retry logic in `src/lib/WebSocketClient.ts:253-274`.
  - No WebSocket ping/pong handling in the adapter itself (`src/lib/WebSocketClient.ts:241-303`).
  - Conclusion: no built-in reconnect and no heartbeat at adapter level.

- Non-adapter ping/pong evidence (workers only):
  - `src/lib/workers/socket-workers.ts:12-13` responds `ping` -> `pong` between main thread and worker.
  - `src/lib/workers/shared-socket-workers.ts:21-22` responds `ping` -> `pong` between port and shared worker.
  - `src/main.ts:35`, `src/main.ts:47` show ping calls commented out.
  - Conclusion: ping/pong exists only for worker messaging, not as network heartbeat/reconnect for WebSocket transport.

### Missing / pitfalls (code-confirmed)

- STOMP adapter lacks heartbeat despite STOMP options being present (`heartbeatIncoming/Outgoing` both 0).
- Native adapter lacks auto-reconnect strategy and transport-level heartbeat.
- Client-side hardcoded URL + auth token/device key are security pitfalls due to credential exposure in shipped source.
