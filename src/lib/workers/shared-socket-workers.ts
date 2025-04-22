/// <reference lib="webworker" />
declare const self: SharedWorkerGlobalScope;

import { WindowWebSocketClient } from "../WebSocketClient";

const ports: MessagePort[] = [];

self.onconnect = (event: MessageEvent) => {
  const port = event.ports[0];
  ports.push(port);

  const client = new WindowWebSocketClient();

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
