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

type WsNetworkLogger = Pick<Console, 'log' | 'error' | 'warn'>;

const noopLogger: WsNetworkLogger = {
  log: () => {},
  error: () => {},
  warn: () => {},
};

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

export class WindowWebSocketClientAdapter extends WebSocketClientAdapter<WebSocket> {
  #url: string;
  #logger: WsNetworkLogger;
  onConnectCallback: () => void;
  onMessageCallback: (data: string) => void;
  onErrorCallback: (error: Error) => void;
  onCloseCallback: () => void;

  constructor(options: { url: string; logger?: WsNetworkLogger }) {
    super();
    this.#url = options.url;
    this.#logger = options.logger ?? noopLogger;
    this.onConnectCallback = () => {};
    this.onMessageCallback = () => {};
    this.onErrorCallback = () => {};
    this.onCloseCallback = () => {};
  }
  connect(): Promise<void> {
    this.#logger.log(this.constructor.name, 'connect');
    return new Promise((resolve) => {
      if (!this.client) {
        this.client = new WebSocket(this.#url);
      }
      this.client.addEventListener("open", () => {
        this.#logger.log(this.constructor.name, 'open');
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
  constructor(options: { url: string; logger?: WsNetworkLogger }) {
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
