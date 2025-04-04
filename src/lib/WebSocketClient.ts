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

abstract class WebSocketClientAdapter<T> implements IWebSocketClientAdapter<T> {
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

class WindowWebSocketClientAdapter extends WebSocketClientAdapter<WebSocket> {
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

export class WebSocketClient implements IWebSocketClient {
  #client: WebSocketClientAdapter<WebSocket>;

  constructor(client: WebSocketClientAdapter<WebSocket>) {
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

class WindowWebSocketClient extends WebSocketClient {
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

const windowWebsocket1 = new WebSocketClient(
  new WindowWebSocketClientAdapter()
);

const windowWebsocket2 = new WindowWebSocketClient();

export { windowWebsocket1, windowWebsocket2 };
