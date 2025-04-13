import { Client as StompClient, StompSubscription } from '@stomp/stompjs';

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

interface IWebSocketPlugin {
  name: string;
  onBeforeConnect?: () => void | Promise<void>;
  onAfterConnect?: () => void | Promise<void>;
  onBeforeSend?: (data: string) => string | Promise<string>;
  onAfterSend?: () => void | Promise<void>;
  onBeforeDisconnect?: () => void | Promise<void>;
  onAfterDisconnect?: () => void | Promise<void>;
  onMessage?: (data: string) => void | Promise<void>;
}

class LoggingPlugin implements IWebSocketPlugin {
  name = 'LoggingPlugin';

  onBeforeConnect() {
    console.log('[LoggingPlugin] 연결을 시도합니다...');
  }

  onAfterConnect() {
    console.log('[LoggingPlugin] 연결되었습니다.');
  }

  onBeforeSend(data: string) {
    console.log('[LoggingPlugin] 메시지 전송:', data);
    return data;
  }

  onAfterSend() {
    console.log('[LoggingPlugin] 메시지가 전송되었습니다.');
  }

  onBeforeDisconnect() {
    console.log('[LoggingPlugin] 연결 종료를 시도합니다...');
  }

  onAfterDisconnect() {
    console.log('[LoggingPlugin] 연결이 종료되었습니다.');
  }

  onMessage(data: string) {
    console.log('[LoggingPlugin] 메시지 수신:', data);
  }
}

interface IWebSocketClient {
  status(): number;
  connect(): void;
  disconnect(): void;
  send(message: string): void;
  onMessage(callback: (message: string) => void): void;
  onError(callback: (error: Error) => void): void;
  onClose(callback: () => void): void;
  onConnect(callback: () => void): void;
}

interface IWebSocketClientAdapter<T> {
  connect(): Promise<void>;
  disconnect(): void;
  send(data: string): void;
  onMessage(callback: (data: string) => void): void;
  onError(callback: (error: Error) => void): void;
  onClose(callback: () => void): void;
  onConnect(callback: () => void): void;
}

export abstract class WebSocketClientAdapter<T>
  implements IWebSocketClientAdapter<T>
{
  protected client?: T;
  public abstract connect(): Promise<void>;
  public abstract disconnect(): void;
  public abstract send(data: string): void;
  public abstract onMessage(callback: (data: string) => void): void;
  public abstract onError(callback: (error: Error) => void): void;
  public abstract onClose(callback: () => void): void;
  public abstract onConnect(callback: () => void): void;
  public abstract networkStatus(): number;
}

export class StompWebSocketClientAdapter
  extends WebSocketClientAdapter<StompClient>
  implements PubSubAble<StompSubscription>
{
  protected client?: StompClient;
  subscriptions: Record<string, StompSubscription> = {};
  onConnectCallback: (() => void) | undefined;
  constructor(client?: StompClient) {
    super();
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
    //@ts-ignore
    this.subscriptions[topic] = this.client?.subscribe(topic, (args) => {
      this.onMessage(callback);
      callback(args.body);
    });
  }
  _unsubscribe(topic: string): void {
    delete this.subscriptions[topic];
  }
  _publish(topic: string, message: string): void {
    this.client?.publish({
      destination: topic,
      body: message,
      headers: {
        'content-type': 'application/json',
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
    topic: string,
    message: string,
    headers = {
      'content-type': 'application/json',
    }
  ): void {
    this.client?.publish({
      destination: topic,
      body: message,
      headers,
    });
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
      console.log(this.constructor.name, 'connect');
      this.client = new StompClient({
        brokerURL: 'wss://stapapp.rfice.com/websocket/connect',
        heartbeatIncoming: 0,
        heartbeatOutgoing: 0,
        reconnectDelay: 5000,
        connectHeaders: {
          authorization:
            'eyJraWQiOiJkZTViZjNkOC03NGE5LTQ0NjMtYWE2Yy0yNTgzNWViNzk0NGQiLCJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9.eyJpc3MiOiJodHRwczovL3N0YXBhcHAucmZpY2UuY29tIiwic3ViIjoiMjc4NTQxYTUtN2IzOS00NDQyLWE2NDctZWU0OWQ5MTZhMGMwIiwidW4iOiJoc3NoaW5AcnN1cHBvcnQuY29tIiwiYXUiOiJHVUVTVCwgVVNFUiIsImV4cCI6MTc0NDAyMjA3NSwiaWF0IjoxNzQ0MDE0ODc1fQ.q35SAgSaGtuYW-1_ycj6swhJTMGtE76xBQyr2aKuu5E7i8Y8gwuVOG7V7Bf0s-oS7xTiOL8bL8Ltn-hEIHYSCw',
          'device-type': 'WEB',
          'device-key':
            'f7hhzpZ7K0pFbgthJwQAFyMozp5bKsnN3RGLTM016rTL8UXQBZjU1qrsws0HFc_l',
          'app-version': '1.0.0',
        },
      });
      this.client.activate();
      this.client.onConnect = () => {
        console.log(this.constructor.name, 'onConnect');
        this.onConnectCallback?.();
        resolve();
      };
    });
  }
  public disconnect(): void {
    this.client?.deactivate();
  }
  public send(data: string): void {
    throw new Error('Method not implemented.');
  }
  public onMessage(callback: (data: string) => void): void {}
  public onError(callback: (error: Error) => void): void {
    // callback?.();
    // throw new Error("Method not implemented.");
  }
  public onClose(callback: () => void): void {
    throw new Error('Method not implemented.');
  }
  public onConnect(callback: () => void): void {
    console.log(this.constructor.name, 'onConnect', this.client, callback);
    this.onConnectCallback = callback;
  }
  public networkStatus(): number {
    throw new Error('Method not implemented.');
  }
}

export class WindowWebSocketClientAdapter extends WebSocketClientAdapter<WebSocket> {
  onConnectCallback: () => void;
  onMessageCallback: (data: string) => void;
  onErrorCallback: (error: Error) => void;
  onCloseCallback: () => void;
  constructor() {
    super();
    this.onConnectCallback = () => {};
    this.onMessageCallback = (data: string) => {};
    this.onErrorCallback = (error: Error) => {};
    this.onCloseCallback = () => {};
  }
  connect(): Promise<void> {
    console.log(this.constructor.name, 'connect');
    return new Promise((resolve) => {
      if (!this.client) {
        this.client = new WebSocket('ws://localhost:8010');
      }
      this.client.addEventListener('open', () => {
        console.log(this.constructor.name, 'open');
        this.onConnectCallback();
        resolve();
      });
      this.client.addEventListener('message', (event) => {
        this.onMessageCallback(event.data);
      });
      this.client.addEventListener('error', (event) => {
        this.onErrorCallback(event as unknown as Error);
      });
      this.client.addEventListener('close', () => {
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
    console.log(this.constructor.name, 'onConnect', this.client, callback);
  }

  networkStatus(): number {
    return this.client?.readyState ?? WebSocket.CLOSED;
  }
}

export class WebSocketClient<T = any> implements IWebSocketClient {
  #client: WebSocketClientAdapter<T>;

  constructor(client: WebSocketClientAdapter<T>) {
    this.#client = client;
  }
  connect(): Promise<void> {
    return this.#client.connect();
  }
  disconnect() {
    return this.#client.disconnect();
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
    console.log(this.constructor.name, 'onConnect', this.#client, callback);
    this.#client.onConnect(callback);
  }
  get client() {
    return this.#client;
  }
  status(): number {
    return this.#client.networkStatus();
  }
}

export class WindowWebSocketClient extends WebSocketClient<WebSocket> {
  constructor() {
    super(new WindowWebSocketClientAdapter());
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
  constructor() {
    super(new StompWebSocketClientAdapter());
  }
  connect(): Promise<void> {
    return this.client.connect();
  }
  disconnect() {
    this.client.disconnect();
  }
}
