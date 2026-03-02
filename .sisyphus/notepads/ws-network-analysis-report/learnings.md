# Learnings

- WebSocket client public API의 핵심 엔트리는 `WebSocketClient<T>`이며 `connect/disconnect/send/onMessage/onError/onClose/onConnect/status`를 어댑터 위임 형태로 노출한다 (`src/lib/WebSocketClient.ts:305`).
- 추상 어댑터는 `WebSocketClientAdapter<T>` 하나로 고정되어 있고, 실제 concrete adapter는 `StompWebSocketClientAdapter`, `WindowWebSocketClientAdapter` 두 개다 (`src/lib/WebSocketClient.ts:97`, `src/lib/WebSocketClient.ts:241`).
- 편의 wrapper client(`WindowWebSocketClient`, `StompWebSocketClient`)는 각각 concrete adapter를 생성해 상위 `WebSocketClient`에 주입한다 (`src/lib/WebSocketClient.ts:341`, `src/lib/WebSocketClient.ts:358`).
- 실제 앱 wiring은 `src/main.ts`에서 `new WebSocketClient(new StompWebSocketClientAdapter())`로 생성해 이벤트 핸들러를 바인딩하는 방식이다 (`src/main.ts:168`).
- Worker/SharedWorker 엔트리포인트는 `WindowWebSocketClient`를 직접 생성하여 메시지 중계를 수행한다 (`src/lib/workers/socket-workers.ts:3`, `src/lib/workers/shared-socket-workers.ts:12`).
- 하드코딩 결합 포인트: STOMP `brokerURL`(`wss://stapapp.rfice.com/websocket/connect`)과 인증/디바이스 헤더값, 브라우저 WebSocket URL(`ws://localhost:8010`)이 코드에 직접 박혀 있다 (`src/lib/WebSocketClient.ts:182`, `src/lib/WebSocketClient.ts:187`, `src/lib/WebSocketClient.ts:257`).

## IWebSocketPlugin wiring validation (2026-03-02)
- Definition path: `src/lib/WebSocketClient.ts:18` defines `interface IWebSocketPlugin { name: string; onBeforeConnect?: () => void | Promise<void>; onAfterConnect?: () => void | Promise<void>; onBeforeSend?: (data: string) => string | Promise<string>; onAfterSend?: () => void | Promise<void>; onBeforeDisconnect?: () => void | Promise<void>; onAfterDisconnect?: () => void | Promise<void>; onMessage?: (data: string) => void | Promise<void>; }`.
- Implementation path: `src/lib/WebSocketClient.ts:29` defines `class LoggingPlugin implements IWebSocketPlugin` with concrete methods `onBeforeConnect()`, `onAfterConnect()`, `onBeforeSend(data: string)`, `onAfterSend()`, `onBeforeDisconnect()`, `onAfterDisconnect()`, `onMessage(data: string)`.
- Wiring check: no plugin container/registry exists in `WebSocketClient` or adapters (`WebSocketClient` only stores `#client: WebSocketClientAdapter<T>`), and repo-wide search finds no `new LoggingPlugin`, no `IWebSocketPlugin` references outside this file.
- Invocation check: hook names are declared/implemented but never called from connect/send/disconnect/message flow; searches for `.onBeforeConnect(`, `.onAfterConnect(`, `.onBeforeSend(`, `.onAfterSend(`, `.onBeforeDisconnect(`, `.onAfterDisconnect(` found no plugin-hook invocations.
- Conclusion (evidence-based): interface exists but not invoked.


## Web Worker / SharedWorker websocket support validation (2026-03-02)

- Files identified under `src/lib/workers/`: `src/lib/workers/socket-workers.ts` (Dedicated Worker) and `src/lib/workers/shared-socket-workers.ts` (SharedWorker).
- Main-thread wiring exists only as commented examples in `src/main.ts`: `new Worker(new URL("./lib/workers/socket-workers.ts", import.meta.url), { type: "module" })` and `new SharedWorker(new URL("./lib/workers/shared-socket-workers.ts", import.meta.url), { type: "module" })`.

### Message protocol observed

- Dedicated worker (`socket-workers.ts`):
  - Worker inbound (`self.onmessage`):
    - `"ping"` -> replies `"pong"`
    - any other payload -> forwarded to `client.send(event.data)`
  - Worker outbound (`self.postMessage`):
    - raw message relay from first `client.onMessage` registration (`self.postMessage(message)`)
    - typed events from second registration:
      - `{ type: "CONNECTED" }`
      - `{ type: "MESSAGE", data: <message> }`
      - `{ type: "ERROR", error: <error.message> }`
      - `{ type: "CLOSED" }`
- Shared worker (`shared-socket-workers.ts`):
  - Uses `self.onconnect` + `event.ports[0]` and stores ports in `ports: MessagePort[]`.
  - Port inbound (`port.onmessage`):
    - `"ping"` -> replies `"pong"`
    - any other payload -> `client.send(event.data)`
  - Port outbound (`port.postMessage`): broadcasts raw websocket message to all connected ports.
  - No typed envelope (`CONNECTED`/`ERROR`/`CLOSED`) is sent from shared worker.

### Constraints / bundler / portability notes

- Worker type expectation: examples use `{ type: "module" }` for both Worker and SharedWorker (ESM workers).
- Bundler expectation: `new URL("./lib/workers/*.ts", import.meta.url)` implies a bundler/runtime that rewrites worker URLs (e.g., Vite/Rollup style).
- TypeScript worker globals:
  - Shared worker explicitly declares `/// <reference lib="webworker" />` + `declare const self: SharedWorkerGlobalScope`.
  - Dedicated worker file does not include explicit worker lib reference/declaration.
- Portability caveat: SharedWorker support is browser-dependent (not universal across all major browsers/platforms); feature detection/fallback is needed for production portability.

### Gaps/missing pieces for real app usage

- Dedicated worker duplicates `client.onMessage` registration (raw + typed), causing duplicate outbound events and mixed payload shapes.
- No explicit command protocol (`connect`/`send`/`close`) from main thread:
  - Dedicated worker auto-calls `client.connect()` on load.
  - Shared worker auto-connects per `onconnect`, creating a separate websocket client per connecting port instead of one shared socket per shared worker.
- No readiness/backpressure handling: messages can be sent before websocket open; no queue/retry/ack strategy.
- No structured validation/schema for `event.data`; arbitrary payload forwarded to `client.send`.
- No cleanup/lifecycle handling for disconnected MessagePorts (ports array only grows).
- Error/close propagation in shared worker is missing (only raw message broadcast + ping/pong).
- No auth/token refresh or reconnect policy control at worker protocol boundary.

## AI rules added (2026-03-02)

- Added AI coding rules at `.github/copilot-instructions.md` and appended repo-specific rules to `AGENTS.md`.
