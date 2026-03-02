# Learnings

## Worker message protocol (2026-03-02)

- Dedicated worker `src/lib/workers/socket-workers.ts` now uses typed-only outbound messages:
  - `{ type: 'CONNECTED' }`, `{ type: 'MESSAGE', data: string }`, `{ type: 'ERROR', error: string }`, `{ type: 'CLOSED' }`, `{ type: 'PONG' }`
- Dedicated worker inbound supports:
  - legacy `'ping'` and typed `{ type: 'PING' }` -> replies `{ type: 'PONG' }`
  - typed `{ type: 'SEND', data: string }` or legacy string -> send
- Shared worker `src/lib/workers/shared-socket-workers.ts` broadcasts the same typed envelopes to all ports and uses a single shared native client connection.
