/// <reference lib="webworker" />
declare const self: SharedWorkerGlobalScope;

import { WindowWebSocketClient } from "../WebSocketClient";

const ports: MessagePort[] = [];

const wsUrl =
  new URL(self.location.href).searchParams.get("wsUrl") ??
  (import.meta as unknown as { env?: { VITE_WS_URL?: string } }).env?.VITE_WS_URL;

if (!wsUrl) {
  throw new Error(
    'Missing WebSocket URL. Provide `?wsUrl=...` in worker URL or set `VITE_WS_URL`.'
  );
}

self.onconnect = (event: MessageEvent) => {
  const port = event.ports[0];
  ports.push(port);

  const client = new WindowWebSocketClient({ url: wsUrl });

  client.onMessage((message) => {
    for (const port of ports) {
      port.postMessage(message);
    }
  });

  port.onmessage = (event: MessageEvent) => {
    if (event.data === "ping") {
      port.postMessage("pong");
    } else {
      client.send(event.data);
    }
  };

  client.connect();
};
