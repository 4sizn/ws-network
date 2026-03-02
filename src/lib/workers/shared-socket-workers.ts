/// <reference lib="webworker" />
declare const self: SharedWorkerGlobalScope;

import { WindowWebSocketClient } from "../WebSocketClient";

type SharedWorkerOutboundMessage =
  | { type: "CONNECTED" }
  | { type: "MESSAGE"; data: string }
  | { type: "ERROR"; error: string }
  | { type: "CLOSED" }
  | { type: "PONG" };

type SharedWorkerInboundMessage =
  | { type: "PING" }
  | { type: "SEND"; data: string };

const ports: MessagePort[] = [];

const wsUrl =
  new URL(self.location.href).searchParams.get("wsUrl") ??
  (import.meta as unknown as { env?: { VITE_WS_URL?: string } }).env?.VITE_WS_URL;

if (!wsUrl) {
  throw new Error(
    'Missing WebSocket URL. Provide `?wsUrl=...` in worker URL or set `VITE_WS_URL`.'
  );
}

function broadcast(message: SharedWorkerOutboundMessage): void {
  for (const port of ports) {
    port.postMessage(message);
  }
}

const client = new WindowWebSocketClient({ url: wsUrl });
let connecting: Promise<void> | null = null;
let connected = false;

client.onConnect(() => {
  connected = true;
  broadcast({ type: "CONNECTED" });
});

client.onMessage((message) => {
  broadcast({ type: "MESSAGE", data: message });
});

client.onError((error) => {
  broadcast({ type: "ERROR", error: error.message });
});

client.onClose(() => {
  connected = false;
  broadcast({ type: "CLOSED" });
});

function ensureConnected(): void {
  if (connected) {
    return;
  }

  if (!connecting) {
    connecting = client.connect().finally(() => {
      connecting = null;
    });
  }
}

self.onconnect = (event: MessageEvent) => {
  const port = event.ports[0];
  ports.push(port);

  port.onmessage = (event: MessageEvent) => {
    const data = event.data as unknown;

    if (data === "ping") {
      port.postMessage({ type: "PONG" } satisfies SharedWorkerOutboundMessage);
      return;
    }

    if (typeof data === "object" && data !== null) {
      const message = data as Partial<SharedWorkerInboundMessage>;

      if (message.type === "PING") {
        port.postMessage({ type: "PONG" } satisfies SharedWorkerOutboundMessage);
        return;
      }

      if (message.type === "SEND" && typeof message.data === "string") {
        ensureConnected();
        client.send(message.data);
        return;
      }
    }

    if (typeof data === "string") {
      ensureConnected();
      client.send(data);
    }
  };

  port.onmessageerror = () => {
    const idx = ports.indexOf(port);
    if (idx >= 0) {
      ports.splice(idx, 1);
    }
  };

  ensureConnected();
};
