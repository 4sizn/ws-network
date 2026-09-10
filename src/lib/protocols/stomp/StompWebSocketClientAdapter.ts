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
  // connect() 는 호출마다 새 StompClient 를 만들었다. 두 번 부르면 첫 것이
  // 고아가 되어 reconnectDelay 마다 재연결을 계속 시도했다. 명시적
  // disconnect() 까지 같은 약속을 돌려준다.
  #connectPromise?: Promise<void>;
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
    this.#connectPromise ??= this.#activate();
    return this.#connectPromise;
  }

  #activate(): Promise<void> {
    // 이전 인스턴스가 남아 있으면 여기서 정리한다. 이게 없으면 어느 경로로든
    // 재활성화될 때 고아가 다시 생긴다.
    this.client?.deactivate();

    return new Promise((resolve, reject) => {
      // 약속은 한 번만 정착한다. 연결 전 실패는 거절이고, 연결된 뒤의 오류는
      // onError 로만 간다.
      let settled = false;
      const fail = (error: Error) => {
        this.onErrorCallback?.(error);
        if (settled) {
          return;
        }
        settled = true;
        // 거절한 약속을 들고 있으면 다음 connect() 가 새 시도 없이 같은
        // 거절만 되돌려준다.
        this.#connectPromise = undefined;
        reject(error);
      };

      this.client = new StompClient({
        brokerURL: this.#brokerURL,
        heartbeatIncoming: this.#heartbeatIncoming,
        heartbeatOutgoing: this.#heartbeatOutgoing,
        reconnectDelay: this.#reconnectDelay,
        connectHeaders: this.#connectHeaders,
      });

      this.client.activate();
      this.client.onConnect = () => {
        settled = true;
        this.onConnectCallback?.();
        resolve();
      };
      this.client.onStompError = (frame) => {
        const body = (frame as { body?: unknown }).body;
        const message = typeof body === 'string' ? body : 'STOMP error';
        fail(new Error(message));
      };

      this.client.onWebSocketError = (event) => {
        fail(
          new Error(
            `WebSocket error: ${(event as { type?: unknown }).type ?? ''}`,
          ),
        );
      };
      this.client.onWebSocketClose = () => {
        if (!settled) {
          // CONNECTED 전에 닫히면 이 시도는 실패다. 브로커가 ERROR 프레임도
          // 오류 이벤트도 없이 닫으면 여기가 유일한 신호다. fail() 이
          // 약속도 버린다.
          fail(new Error('WebSocket closed before the STOMP session opened'));
        } else if (!this.client?.active || this.#reconnectDelay === 0) {
          // stompjs 는 소켓이 끊기면 active 상태에서 재연결을 예약한다. 단
          // reconnectDelay 가 0 이면 예약이 없는데도 상태는 active 로 남는다.
          // 그 경우 약속을 버려야 다음 connect() 가 실제로 다시 붙는다.
          this.#connectPromise = undefined;
        }
        this.onCloseCallback?.();
      };
      this.client.onDisconnect = () => {
        this.onCloseCallback?.();
      };
    });
  }

  public disconnect(): void {
    // deactivate 된 클라이언트는 되살릴 수 없다. 약속도 같이 버려서 다음
    // connect() 가 새 클라이언트를 만들게 한다.
    this.#connectPromise = undefined;
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
