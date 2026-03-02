import { WindowWebSocketClient } from "../WebSocketClient";

type WorkerOutboundMessage =
  | { type: "CONNECTED" }
  | { type: "MESSAGE"; data: string }
  | { type: "ERROR"; error: string }
  | { type: "CLOSED" }
  | { type: "PONG" };

type WorkerInboundMessage =
  | { type: "PING" }
  | { type: "SEND"; data: string };

function postMessage(message: WorkerOutboundMessage): void {
  self.postMessage(message);
}

const wsUrl =
  new URL(self.location.href).searchParams.get("wsUrl") ??
  (import.meta as unknown as { env?: { VITE_WS_URL?: string } }).env?.VITE_WS_URL;

if (!wsUrl) {
  throw new Error(
    'Missing WebSocket URL. Provide `?wsUrl=...` in worker URL or set `VITE_WS_URL`.'
  );
}

const client = new WindowWebSocketClient({ url: wsUrl });

client.connect();

client.onMessage((message) => {
  postMessage({ type: "MESSAGE", data: message });
});

self.onmessage = (event) => {
  const data = event.data as unknown;

  if (data === "ping") {
    postMessage({ type: "PONG" });
    return;
  }

  if (typeof data === "object" && data !== null) {
    const message = data as Partial<WorkerInboundMessage>;

    if (message.type === "PING") {
      postMessage({ type: "PONG" });
      return;
    }

    if (message.type === "SEND" && typeof message.data === "string") {
      client.send(message.data);
      return;
    }
  }

  if (typeof data === "string") {
    client.send(data);
  }
};

self.onerror = (event) => {
  postMessage({ type: "ERROR", error: String(event) });
};

self.onclose = () => {
  postMessage({ type: "CLOSED" });
};

client.onConnect(() => {
  postMessage({ type: "CONNECTED" });
});

client.onError((error) => {
  postMessage({ type: "ERROR", error: error.message });
});

client.onClose(() => {
  postMessage({ type: "CLOSED" });
});
