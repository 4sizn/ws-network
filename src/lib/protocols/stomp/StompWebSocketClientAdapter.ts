import { Client as StompClient, StompSubscription } from '@stomp/stompjs';
import { WebSocketClientAdapter } from '../../WebSocketClient';

interface PubSubAble<T> {
  subscriptions: Record<string, T>;
  subscribe(
    topic: string | string[],
    callback: (message: string) => void,
  ): void;
  unsubscribe(topic: string | string[]): void;
  publish(topic: string | string[], message: string): void;
  isSubscribed(topic: string | string[]): boolean;
  _subscribe(topic: string, callback: (message: string) => void): void;
  _unsubscribe(topic: string): void;
  _publish(topic: string, message: string): void;
  _isSubscribed(topic: string): boolean;
}

// 코어 발신 파이프라인이 어댑터로 넘겨주는 STOMP 전용 정보. 배열 목적지를
// 여기서 받으므로 훅은 publish 1회당 1번만 돈다.
export interface StompSendOptions {
  destination: string | string[];
  headers?: Record<string, string>;
}

const DEFAULT_SEND_HEADERS: Record<string, string> = {
  'content-type': 'application/json',
};

export interface StompWebSocketClientAdapterOptions {
  brokerURL: string;
  connectHeaders?: Record<string, string>;
  heartbeatIncoming?: number;
  heartbeatOutgoing?: number;
  reconnectDelay?: number;
}

export class StompWebSocketClientAdapter
  extends WebSocketClientAdapter<StompClient, StompSendOptions>
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
    options: StompWebSocketClientAdapterOptions,
    client?: StompClient,
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
      const data = typeof body === 'string' ? body : '';
      callback(data);
      // 구독 콜백만 부르면 코어의 onMessage 리스너, messages$, 플러그인
      // onMessage 훅이 STOMP 에서는 아무것도 받지 못한다.
      this.onMessageCallback(data);
    });
    if (subscription) {
      this.subscriptions[topic] = subscription;
    }
  }

  _unsubscribe(topic: string): void {
    // 레코드만 지우면 브로커는 계속 보낸다. STOMP UNSUBSCRIBE 프레임은
    // 구독 객체가 보낸다.
    this.subscriptions[topic]?.unsubscribe();
    delete this.subscriptions[topic];
  }

  _publish(topic: string, message: string): void {
    this.send(message, { destination: topic });
  }

  public subscribe(
    topic: string[] | string,
    callback: (message: string) => void,
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
    headers = DEFAULT_SEND_HEADERS,
  ): void {
    this.send(message, { destination: topic, headers });
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
      this.client = new StompClient({
        brokerURL: this.#brokerURL,
        heartbeatIncoming: this.#heartbeatIncoming,
        heartbeatOutgoing: this.#heartbeatOutgoing,
        reconnectDelay: this.#reconnectDelay,
        connectHeaders: this.#connectHeaders,
      });

      this.client.activate();
      this.client.onConnect = () => {
        this.onConnectCallback?.();
        resolve();
      };
      this.client.onStompError = (frame) => {
        const body = (frame as { body?: unknown }).body;
        const message = typeof body === 'string' ? body : 'STOMP error';
        this.onErrorCallback?.(new Error(message));
      };

      this.client.onWebSocketError = (event) => {
        this.onErrorCallback?.(
          new Error(
            `WebSocket error: ${(event as { type?: unknown }).type ?? ''}`,
          ),
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

  public send(data: string, options: StompSendOptions): void {
    const headers = options.headers ?? DEFAULT_SEND_HEADERS;
    const destinations = Array.isArray(options.destination)
      ? options.destination
      : [options.destination];

    for (const destination of destinations) {
      this.client?.publish({ destination, body: data, headers });
    }
  }

  public onMessage(callback: (data: string) => void): void {
    this.onMessageCallback = callback;
  }

  public onClose(callback: () => void): void {
    this.onCloseCallback = callback;
  }

  public onConnect(callback: () => void): void {
    this.onConnectCallback = callback;
  }

  public onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  // WindowWebSocketClientAdapter 와 같은 의미를 돌려준다: STOMP 세션 상태가
  // 아니라 소켓 상태다. 소켓이 열렸어도 STOMP CONNECTED 전이면 OPEN 이다.
  // 세션 상태가 필요하면 onConnect/onClose 로 추적한다.
  public networkStatus(): number {
    return this.client?.webSocket?.readyState ?? WebSocket.CLOSED;
  }
}
