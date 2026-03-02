import { Client as StompClient, StompSubscription } from "@stomp/stompjs";

interface PubSubAble<T> {
  subscriptions: Record<string, T>;
  subscribe(
    topic: string | string[],
    callback: (message: string) => void
  ): void;
  unsubscribe(topic: string | string[]): void;
  publish(topic: string | string[], message: string): void;
  isSubscribed(topic: string | string[]): boolean;
  _subscribe(topic: string, callback: (message: string) => void): void;
  _unsubscribe(topic: string): void;
  _publish(topic: string, message: string): void;
  _isSubscribed(topic: string): boolean;
}

export interface IWebSocketPlugin {
  name: string;
  onBeforeConnect?: () => void | Promise<void>;
  onAfterConnect?: () => void | Promise<void>;
  onBeforeSend?: (data: string) => string | Promise<string>;
  onAfterSend?: () => void | Promise<void>;
  onBeforeDisconnect?: () => void | Promise<void>;
  onAfterDisconnect?: () => void | Promise<void>;
  onMessage?: (data: string) => void | Promise<void>;
}

export class LoggingPlugin implements IWebSocketPlugin {
  name = "LoggingPlugin";

  onBeforeConnect() {
    console.log("[LoggingPlugin] 연결을 시도합니다...");
  }

  onAfterConnect() {
    console.log("[LoggingPlugin] 연결되었습니다.");
  }

  onBeforeSend(data: string) {
    console.log("[LoggingPlugin] 메시지 전송:", data);
    return data;
  }

  onAfterSend() {
    console.log("[LoggingPlugin] 메시지가 전송되었습니다.");
  }

  onBeforeDisconnect() {
    console.log("[LoggingPlugin] 연결 종료를 시도합니다...");
  }

  onAfterDisconnect() {
    console.log("[LoggingPlugin] 연결이 종료되었습니다.");
  }

  onMessage(data: string) {
    console.log("[LoggingPlugin] 메시지 수신:", data);
  }
}

interface IWebSocketClient {
  status(): number;
  connect(): Promise<void>;
  disconnect(): void;
  send(message: string): void;
  onMessage(callback: (message: string) => void): void;
  onError(callback: (error: Error) => void): void;
  onClose(callback: () => void): void;
  onConnect(callback: () => void): void;
}

interface IWebSocketClientAdapter {
  connect(): Promise<void>;
  disconnect(): void;
  send(data: string): void;
  onMessage(callback: (data: string) => void): void;
  onError(callback: (error: Error) => void): void;
  onClose(callback: () => void): void;
  onConnect(callback: () => void): void;
}

export abstract class WebSocketClientAdapter<T>
  implements IWebSocketClientAdapter
{
  protected client?: T;
  public abstract connect(): Promise<void>;
  public abstract disconnect(): void;
  public abstract send(data: string): void;
  public abstract onMessage(args: unknown): void;
  public abstract onError(args: unknown): void;
  public abstract onClose(args: unknown): void;
  public abstract onConnect(args: unknown): void;
  public abstract networkStatus(): number;
}

export class StompWebSocketClientAdapter
  extends WebSocketClientAdapter<StompClient>
  implements PubSubAble<StompSubscription>
{
  #brokerURL: string;
  #connectHeaders?: Record<string, string>;
  #heartbeatIncoming: number;
  #heartbeatOutgoing: number;
  #reconnectDelay: number;

  protected client?: StompClient;
  subscriptions: Record<string, StompSubscription> = {};
  onConnectCallback: (() => void) | undefined;
  onMessageCallback: (data: string) => void = () => {};
  onErrorCallback: ((error: Error) => void) | undefined;
  onCloseCallback: (() => void) | undefined;

  constructor(
    options: {
      brokerURL: string;
      connectHeaders?: Record<string, string>;
      heartbeatIncoming?: number;
      heartbeatOutgoing?: number;
      reconnectDelay?: number;
    },
    client?: StompClient
  ) {
    super();
    this.#brokerURL = options.brokerURL;
    this.#connectHeaders = options.connectHeaders;
    this.#heartbeatIncoming = options.heartbeatIncoming ?? 0;
    this.#heartbeatOutgoing = options.heartbeatOutgoing ?? 0;
    this.#reconnectDelay = options.reconnectDelay ?? 5000;
    this.client = client;
  }
  public unsubscribe(topic: string | string[]): void {
    if (Array.isArray(topic)) {
      for (const t of topic) {
        this._unsubscribe(t);
      }
    } else {
      this._unsubscribe(topic);
    }
  }
  _subscribe(topic: string, callback: (message: string) => void): void {
    const subscription = this.client?.subscribe(topic, (message) => {
      const body = (message as { body?: unknown }).body;
      callback(typeof body === "string" ? body : "");
    });
    if (subscription) {
      this.subscriptions[topic] = subscription;
    }
  }
  _unsubscribe(topic: string): void {
    delete this.subscriptions[topic];
  }
  _publish(topic: string, message: string): void {
    this.client?.publish({
      destination: topic,
      body: message,
      headers: {
        "content-type": "application/json",
      },
    });
  }

  public subscribe(
    topic: string[] | string,
    callback: (message: string) => void
  ): void {
    if (Array.isArray(topic)) {
      for (const t of topic) {
        this._subscribe(t, callback);
      }
    } else {
      this._subscribe(topic, callback);
    }
  }

  public publish(
    topic: string | string[],
    message: string,
    headers = {
      "content-type": "application/json",
    }
  ): void {
    if (Array.isArray(topic)) {
      for (const t of topic) {
        this._publish(t, message);
      }
      return;
    }
    this.client?.publish({ destination: topic, body: message, headers });
  }

  public isSubscribed(topic: string[] | string): boolean {
    if (Array.isArray(topic)) {
      return topic.every((t) => this._isSubscribed(t));
    }
    return this._isSubscribed(topic);
  }

  _isSubscribed(topic: string): boolean {
    return this.subscriptions[topic] !== undefined;
  }

  public connect(): Promise<void> {
    return new Promise((resolve) => {
      console.log(this.constructor.name, "connect");
      this.client = new StompClient({
        brokerURL: this.#brokerURL,
        heartbeatIncoming: this.#heartbeatIncoming,
        heartbeatOutgoing: this.#heartbeatOutgoing,
        reconnectDelay: this.#reconnectDelay,
        connectHeaders: this.#connectHeaders,
      });

      this.client.activate();
      this.client.onConnect = () => {
        console.log(this.constructor.name, "onConnect");
        this.onConnectCallback?.();
        resolve();
      };
      this.client.onStompError = (frame) => {
        const body = (frame as { body?: unknown }).body;
        const message = typeof body === "string" ? body : "STOMP error";
        this.onErrorCallback?.(new Error(message));
      };

      this.client.onWebSocketError = (event) => {
        this.onErrorCallback?.(
          new Error(`WebSocket error: ${(event as { type?: unknown }).type ?? ""}`)
        );
      };
      this.client.onWebSocketClose = () => {
        this.onCloseCallback?.();
      };
      this.client.onDisconnect = () => {
        this.onCloseCallback?.();
      };
    });
  }
  public disconnect(): void {
    this.client?.deactivate();
  }
  public send(_data: string): void {
    throw new Error("Method not implemented.");
  }
  public onMessage(callback: (data: string) => void): void {
    this.onMessageCallback = callback;
  }
  public onClose(callback: () => void): void {
    this.onCloseCallback = callback;
  }
  public onConnect(callback: () => void): void {
    console.log(this.constructor.name, "onConnect", this.client, callback);
    this.onConnectCallback = callback;
  }
  public onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }
  public networkStatus(): number {
    throw new Error("Method not implemented.");
  }
}

export class WindowWebSocketClientAdapter extends WebSocketClientAdapter<WebSocket> {
  #url: string;
  onConnectCallback: () => void;
  onMessageCallback: (data: string) => void;
  onErrorCallback: (error: Error) => void;
  onCloseCallback: () => void;

  constructor(options: { url: string }) {
    super();
    this.#url = options.url;
    this.onConnectCallback = () => {};
    this.onMessageCallback = () => {};
    this.onErrorCallback = () => {};
    this.onCloseCallback = () => {};
  }
  connect(): Promise<void> {
    console.log(this.constructor.name, "connect");
    return new Promise((resolve) => {
      if (!this.client) {
        this.client = new WebSocket(this.#url);
      }
      this.client.addEventListener("open", () => {
        console.log(this.constructor.name, "open");
        this.onConnectCallback();
        resolve();
      });
      this.client.addEventListener("message", (event) => {
        this.onMessageCallback(event.data);
      });
      this.client.addEventListener("error", (event) => {
        this.onErrorCallback(event as unknown as Error);
      });
      this.client.addEventListener("close", () => {
        this.onCloseCallback();
      });
    });
  }
  disconnect() {
    this.client?.close();
  }

  send(data: string) {
    this.client?.send(data);
  }

  onMessage(callback: (data: string) => void): void {
    this.onMessageCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  onClose(callback: () => void): void {
    this.onCloseCallback = callback;
  }

  onConnect(callback: () => void): void {
    this.onConnectCallback = callback;
    console.log(this.constructor.name, "onConnect", this.client, callback);
  }

  networkStatus(): number {
    return this.client?.readyState ?? WebSocket.CLOSED;
  }
}

export class WebSocketClient<T = unknown> implements IWebSocketClient {
  #client: WebSocketClientAdapter<T>;

  constructor(client: WebSocketClientAdapter<T>) {
    this.#client = client;
  }
  connect(): Promise<void> {
    return this.#client.connect();
  }
  disconnect(): void {
    this.#client.disconnect();
  }
  send(message: string): void {
    this.#client.send(message);
  }
  onMessage(callback: (message: string) => void): void {
    this.#client.onMessage(callback);
  }
  onError(callback: (error: Error) => void): void {
    this.#client.onError(callback);
  }
  onClose(callback: () => void): void {
    this.#client.onClose(callback);
  }
  onConnect(callback: () => void): void {
    console.log(this.constructor.name, "onConnect", this.#client, callback);
    this.#client.onConnect(callback);
  }
  get client() {
    return this.#client;
  }
  status(): number {
    return this.#client.networkStatus();
  }

  publish(topic: string | string[], message: string): void {
    const client = this.#client as unknown as PubSubAble<unknown>;
    if (typeof client.publish !== "function") {
      throw new Error("publish is not supported by this adapter");
    }
    client.publish(topic, message);
  }

  subscribe(topic: string | string[], callback: (message: string) => void): void {
    const client = this.#client as unknown as PubSubAble<unknown>;
    if (typeof client.subscribe !== "function") {
      throw new Error("subscribe is not supported by this adapter");
    }
    client.subscribe(topic, callback);
  }

  unsubscribe(topic: string | string[]): void {
    const client = this.#client as unknown as PubSubAble<unknown>;
    if (typeof client.unsubscribe !== "function") {
      throw new Error("unsubscribe is not supported by this adapter");
    }
    client.unsubscribe(topic);
  }

  isSubscribed(topic: string | string[]): boolean {
    const client = this.#client as unknown as PubSubAble<unknown>;
    if (typeof client.isSubscribed !== "function") {
      throw new Error("isSubscribed is not supported by this adapter");
    }
    return client.isSubscribed(topic);
  }
}

export class WindowWebSocketClient extends WebSocketClient<WebSocket> {
  constructor(options: { url: string }) {
    super(new WindowWebSocketClientAdapter(options));
  }
  connect(): Promise<void> {
    return this.client.connect();
  }

  disconnect() {
    this.client.disconnect();
  }

  send(message: string) {
    this.client.send(message);
  }
}

export class StompWebSocketClient extends WebSocketClient<StompClient> {
  constructor(options: {
    brokerURL: string;
    connectHeaders?: Record<string, string>;
    heartbeatIncoming?: number;
    heartbeatOutgoing?: number;
    reconnectDelay?: number;
  }) {
    super(new StompWebSocketClientAdapter(options));
  }
  connect(): Promise<void> {
    return this.client.connect();
  }
  disconnect() {
    this.client.disconnect();
  }
}
