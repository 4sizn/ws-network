import { Observable, Subject } from 'rxjs';

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
  name = 'LoggingPlugin';
  #logger: WsNetworkLogger;

  constructor(logger: WsNetworkLogger = noopLogger) {
    this.#logger = logger;
  }

  onBeforeConnect() {
    this.#logger.log('[LoggingPlugin] 연결을 시도합니다...');
  }

  onAfterConnect() {
    this.#logger.log('[LoggingPlugin] 연결되었습니다.');
  }

  onBeforeSend(data: string) {
    this.#logger.log('[LoggingPlugin] 메시지 전송:', data);
    return data;
  }

  onAfterSend() {
    this.#logger.log('[LoggingPlugin] 메시지가 전송되었습니다.');
  }

  onBeforeDisconnect() {
    this.#logger.log('[LoggingPlugin] 연결 종료를 시도합니다...');
  }

  onAfterDisconnect() {
    this.#logger.log('[LoggingPlugin] 연결이 종료되었습니다.');
  }

  onMessage(data: string) {
    this.#logger.log('[LoggingPlugin] 메시지 수신:', data);
  }
}

export type WsNetworkLogger = Pick<Console, 'log' | 'error' | 'warn'>;

export type WebSocketClientOptions = {
  plugins?: IWebSocketPlugin[];
  logger?: WsNetworkLogger;
};

export type Unsubscribe = () => void;

export type ListenerOptions = {
  signal?: AbortSignal;
};

export type WindowWebSocketClientOptions = WebSocketClientOptions & {
  url: string;
  logger?: WsNetworkLogger;
};

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
  onMessage(
    callback: (message: string) => void,
    options?: ListenerOptions,
  ): Unsubscribe;
  onError(
    callback: (error: Error) => void,
    options?: ListenerOptions,
  ): Unsubscribe;
  onClose(callback: () => void, options?: ListenerOptions): Unsubscribe;
  onConnect(callback: () => void, options?: ListenerOptions): Unsubscribe;
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
  public abstract onMessage(callback: (data: string) => void): void;
  public abstract onError(callback: (error: Error) => void): void;
  public abstract onClose(callback: () => void): void;
  public abstract onConnect(callback: () => void): void;
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
  #plugins: IWebSocketPlugin[];
  #logger: WsNetworkLogger;
  #messageListeners: Set<(message: string) => void>;
  #errorListeners: Set<(error: Error) => void>;
  #closeListeners: Set<() => void>;
  #connectListeners: Set<() => void>;
  #messageSubject: Subject<string>;
  #errorSubject: Subject<Error>;
  #connectSubject: Subject<void>;
  #closeSubject: Subject<void>;
  public readonly messages$: Observable<string>;
  public readonly errors$: Observable<Error>;
  public readonly connected$: Observable<void>;
  public readonly closed$: Observable<void>;

  constructor(
    client: WebSocketClientAdapter<T>,
    options?: WebSocketClientOptions,
  ) {
    this.#client = client;
    this.#plugins = options?.plugins ?? [];
    this.#logger = options?.logger ?? noopLogger;
    this.#messageListeners = new Set();
    this.#errorListeners = new Set();
    this.#closeListeners = new Set();
    this.#connectListeners = new Set();
    this.#messageSubject = new Subject<string>();
    this.#errorSubject = new Subject<Error>();
    this.#connectSubject = new Subject<void>();
    this.#closeSubject = new Subject<void>();
    this.messages$ = this.#messageSubject.asObservable();
    this.errors$ = this.#errorSubject.asObservable();
    this.connected$ = this.#connectSubject.asObservable();
    this.closed$ = this.#closeSubject.asObservable();

    this.#client.onMessage((message: string) => {
      void this.#handleIncomingMessage(message).catch((error) => {
        this.#logger.warn('[WebSocketClient] handleIncomingMessage failed', error);
      });
    });
    this.#client.onError((error: Error) => {
      this.#emitError(error);
    });
    this.#client.onClose(() => {
      this.#emitClose();
    });
    this.#client.onConnect(() => {
      this.#emitConnect();
    });
  }
  async connect(): Promise<void> {
    await this.#runVoidHook('onBeforeConnect');
    await this.#client.connect();
    await this.#runVoidHook('onAfterConnect');
  }

  disconnect(): void {
    void this.disconnectAsync().catch((error) => {
      this.#logger.warn('[WebSocketClient] disconnectAsync failed', error);
    });
  }

  send(message: string): void {
    void this.sendAsync(message).catch((error) => {
      this.#logger.warn('[WebSocketClient] sendAsync failed', error);
    });
  }

  onMessage(
    callback: (message: string) => void,
    options?: ListenerOptions,
  ): Unsubscribe {
    return this.#registerListener(this.#messageListeners, callback, options);
  }

  onError(
    callback: (error: Error) => void,
    options?: ListenerOptions,
  ): Unsubscribe {
    return this.#registerListener(this.#errorListeners, callback, options);
  }

  onClose(callback: () => void, options?: ListenerOptions): Unsubscribe {
    return this.#registerListener(this.#closeListeners, callback, options);
  }

  onConnect(callback: () => void, options?: ListenerOptions): Unsubscribe {
    return this.#registerListener(this.#connectListeners, callback, options);
  }

  addPlugin(plugin: IWebSocketPlugin): void {
    this.#plugins = [...this.#plugins, plugin];
  }

  removePlugin(name: string): void {
    this.#plugins = this.#plugins.filter((plugin) => plugin.name !== name);
  }

  setPlugins(plugins: IWebSocketPlugin[]): void {
    this.#plugins = [...plugins];
  }

  async sendAsync(message: string): Promise<void> {
    const transformedMessage = await this.#runBeforeSendHooks(message);
    this.#client.send(transformedMessage);
    await this.#runVoidHook('onAfterSend');
  }

  async disconnectAsync(): Promise<void> {
    await this.#runVoidHook('onBeforeDisconnect');
    this.#client.disconnect();
    await this.#runVoidHook('onAfterDisconnect');
  }

  get client() {
    return this.#client;
  }

  status(): number {
    return this.#client.networkStatus();
  }

  async #handleIncomingMessage(message: string): Promise<void> {
    for (const plugin of this.#plugins) {
      if (!plugin.onMessage) {
        continue;
      }

      try {
        await plugin.onMessage(message);
      } catch (error) {
        this.#logger.warn(
          `[WebSocketClient] Plugin ${plugin.name} onMessage failed`,
          error,
        );
      }
    }

    try {
      this.#emitMessage(message);
    } catch (error) {
      this.#logger.warn('[WebSocketClient] onMessage listeners failed', error);
    }
  }

  #registerListener<T>(
    listeners: Set<(value: T) => void>,
    callback: (value: T) => void,
    options?: ListenerOptions,
  ): Unsubscribe {
    listeners.add(callback);

    let isUnsubscribed = false;
    const unsubscribe = () => {
      if (isUnsubscribed) {
        return;
      }

      isUnsubscribed = true;
      listeners.delete(callback);
      options?.signal?.removeEventListener('abort', unsubscribe);
    };

    if (options?.signal) {
      if (options.signal.aborted) {
        unsubscribe();
      } else {
        options.signal.addEventListener('abort', unsubscribe, { once: true });
      }
    }

    return unsubscribe;
  }

  #emitMessage(message: string): void {
    for (const listener of this.#messageListeners) {
      try {
        listener(message);
      } catch (error) {
        this.#logger.warn('[WebSocketClient] onMessage listener threw', error);
      }
    }

    this.#messageSubject.next(message);
  }

  #emitError(error: Error): void {
    for (const listener of this.#errorListeners) {
      try {
        listener(error);
      } catch (listenerError) {
        this.#logger.warn('[WebSocketClient] onError listener threw', listenerError);
      }
    }

    this.#errorSubject.next(error);
  }

  #emitClose(): void {
    for (const listener of this.#closeListeners) {
      try {
        listener();
      } catch (error) {
        this.#logger.warn('[WebSocketClient] onClose listener threw', error);
      }
    }

    this.#closeSubject.next();
  }

  #emitConnect(): void {
    for (const listener of this.#connectListeners) {
      try {
        listener();
      } catch (error) {
        this.#logger.warn('[WebSocketClient] onConnect listener threw', error);
      }
    }

    this.#connectSubject.next();
  }

  async #runVoidHook(
    hook:
      | 'onBeforeConnect'
      | 'onAfterConnect'
      | 'onBeforeDisconnect'
      | 'onAfterDisconnect'
      | 'onAfterSend',
  ): Promise<void> {
    for (const plugin of this.#plugins) {
      const hookHandler = plugin[hook];
      if (!hookHandler) {
        continue;
      }

      try {
        await hookHandler.call(plugin);
      } catch (error) {
        this.#logger.warn(
          `[WebSocketClient] Plugin ${plugin.name} ${hook} failed`,
          error,
        );
      }
    }
  }

  async #runBeforeSendHooks(message: string): Promise<string> {
    let transformedMessage = message;

    for (const plugin of this.#plugins) {
      if (!plugin.onBeforeSend) {
        continue;
      }

      try {
        transformedMessage = await plugin.onBeforeSend(transformedMessage);
      } catch (error) {
        this.#logger.warn(
          `[WebSocketClient] Plugin ${plugin.name} onBeforeSend failed`,
          error,
        );
      }
    }

    return transformedMessage;
  }
}

export class WindowWebSocketClient extends WebSocketClient<WebSocket> {
  constructor(options: WindowWebSocketClientOptions) {
    super(
      new WindowWebSocketClientAdapter({
        url: options.url,
        logger: options.logger,
      }),
      {
        plugins: options.plugins,
        logger: options.logger,
      },
    );
  }
}
