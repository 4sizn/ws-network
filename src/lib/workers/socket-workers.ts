import { WindowWebSocketClient } from "../WebSocketClient";

const client = new WindowWebSocketClient();

client.connect();

client.onMessage((message) => {
  self.postMessage(message);
});

self.onmessage = (event) => {
  if (event.data === "ping") {
    self.postMessage("pong");
  } else {
    client.send(event.data);
  }
};

self.onerror = (event) => {
  console.error(event);
};

self.onclose = () => {
  console.log("worker closed");
};

client.onConnect(() => {
  self.postMessage({ type: "CONNECTED" });
});

client.onMessage((message) => {
  self.postMessage({
    type: "MESSAGE",
    data: message,
  });
});

client.onError((error) => {
  self.postMessage({
    type: "ERROR",
    error: error.message,
  });
});

client.onClose(() => {
  self.postMessage({ type: "CLOSED" });
});
