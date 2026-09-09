import { WebSocketClientAdapter } from '../../WebSocketClient';
import { isString } from '../../utils';
import { isTopicMatch } from './topicMatch';

interface PubSubAble<T> {
  subscriptions: Record<string, T>;
  subscribe(
    topic: string | string[],
    callback: MqttMessageCallback,
    options?: unknown,
  ): void;
  unsubscribe(topic: string | string[]): void;
  publish(topic: string | string[], message: string, options?: unknown): void;
  isSubscribed(topic: string | string[]): boolean;
  _subscribe(
    topic: string,
    callback: MqttMessageCallback,
    options?: unknown,
  ): void;
  _unsubscribe(topic: string): void;
  _publish(topic: string, message: string, options?: unknown): void;
  _isSubscribed(topic: string): boolean;
}

export type MqttMessageListener = (topic: string, payload: Uint8Array) => void;

/** mqtt 쪽 구독·언구독·발행 완료 콜백. 실패를 `onError`로 잇기 위해 받는다. */
export type MqttOperationCallback = (error?: Error | null) => void;

/**
 * 주입되는 MQTT 클라이언트의 구조적 계약. 이 저장소는 `mqtt` 모듈을 런타임에
 * import하지 않고, 호출자가 넘긴 객체가 이 형태를 만족하는지만 본다.
 * 메서드 문법으로 선언해 실제 `mqtt.MqttClient`가 옵션 타입 차이에도
 * 구조적으로 대입되게 한다.
 */
export interface IMqttClient {
  connected?: boolean;
  subscribe(
    topic: string | string[],
    options?: unknown,
    callback?: MqttOperationCallback,
  ): unknown;
  unsubscribe(
    topic: string | string[],
    options?: unknown,
    callback?: MqttOperationCallback,
  ): unknown;
  publish(
    topic: string,
    message: string,
    options?: unknown,
    callback?: MqttOperationCallback,
  ): unknown;
  end(force?: boolean): unknown;
  on(event: 'message', listener: MqttMessageListener): unknown;
  on(event: 'connect' | 'close', listener: () => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

/**
 * `mqtt.connect` 자리에 들어가는 팩토리. `TOptions`가 제네릭이라 옵션 타입이
 * 호출자의 `mqtt.connect`에서 추론되고, 이 저장소는 `IClientOptions`를 알 필요가
 * 없다.
 */
export type MqttConnect<TOptions = unknown> = (
  url: string,
  options?: TOptions,
) => IMqttClient;

export interface MqttWebSocketClientAdapterOptions<TOptions = unknown> {
  brokerURL: string;
  connect: MqttConnect<TOptions>;
  connectOptions?: TOptions;
}

/**
 * 구독 콜백은 topic을 두 번째 인자로 받는다. 와일드카드 구독자가 어느 topic에서
 * 온 메시지인지 알 수 있어야 하기 때문이다 (review.md D1).
 */
export type MqttMessageCallback = (message: string, topic: string) => void;

export interface MqttSubscription {
  filter: string;
  callbacks: Set<MqttMessageCallback>;
  options?: unknown;
  /** 브로커에 실제로 등록됐는지. 연결 전 구독은 false로 대기한다 (D3). */
  registered: boolean;
}

const SHARED_SUBSCRIPTION_PREFIX = '$share/';

export class MqttWebSocketClientAdapter<TOptions = unknown>
  extends WebSocketClientAdapter<IMqttClient>
  implements PubSubAble<MqttSubscription>
{
  #brokerURL: string;
  #connect: MqttConnect<TOptions>;
  #connectOptions?: TOptions;
  #decoder = new TextDecoder();
  #connecting?: Promise<void>;
  #settled = false;

  protected client?: IMqttClient;
  subscriptions: Record<string, MqttSubscription> = {};
  onConnectCallback: (() => void) | undefined;
  onMessageCallback: (data: string) => void = () => {};
  onErrorCallback: ((error: Error) => void) | undefined;
  onCloseCallback: (() => void) | undefined;

  constructor(
    options: MqttWebSocketClientAdapterOptions<TOptions>,
    client?: IMqttClient,
  ) {
    super();
    this.#brokerURL = options.brokerURL;
    this.#connect = options.connect;
    this.#connectOptions = options.connectOptions;
    this.client = client;
  }

  /**
   * 리스너는 한 번만 등록한다. 재호출은 진행 중인 같은 Promise를 돌려준다 (B2).
   * 최초 연결이 확정되기 전의 `'error'`는 reject한다 — 그렇지 않으면 브로커
   * 연결 실패 시 이 Promise가 영원히 대기한다 (B1).
   */
  public connect(): Promise<void> {
    if (this.#connecting) {
      return this.#connecting;
    }

    this.#connecting = new Promise<void>((resolve, reject) => {
      const client =
        this.client ?? this.#connect(this.#brokerURL, this.#connectOptions);
      this.client = client;

      client.on('connect', () => {
        this.#settled = true;
        this.#flushPendingSubscriptions();
        this.onConnectCallback?.();
        resolve();
      });

      client.on('message', (topic, payload) => {
        this.#deliver(topic, this.#decoder.decode(payload));
      });

      client.on('error', (error) => {
        this.onErrorCallback?.(error);

        if (!this.#settled) {
          this.#settled = true;
          this.#connecting = undefined;
          reject(error);
        }
      });

      client.on('close', () => {
        this.onCloseCallback?.();
      });
    });

    return this.#connecting;
  }

  public disconnect(): void {
    this.client?.end();
  }

  public subscribe(
    topic: string | string[],
    callback: MqttMessageCallback,
    options?: unknown,
  ): void {
    if (isString(topic)) {
      this._subscribe(topic, callback, options);
      return;
    }

    for (const one of topic) {
      this._subscribe(one, callback, options);
    }
  }

  public unsubscribe(topic: string | string[]): void {
    if (isString(topic)) {
      this._unsubscribe(topic);
      return;
    }

    for (const one of topic) {
      this._unsubscribe(one);
    }
  }

  public publish(
    topic: string | string[],
    message: string,
    options?: unknown,
  ): void {
    if (isString(topic)) {
      this._publish(topic, message, options);
      return;
    }

    for (const one of topic) {
      this._publish(one, message, options);
    }
  }

  public isSubscribed(topic: string | string[]): boolean {
    if (isString(topic)) {
      return this._isSubscribed(topic);
    }

    return topic.every((one) => this._isSubscribed(one));
  }

  /**
   * 연결 전 호출도 버리지 않고 레코드에 담아둔다. 실제 브로커 등록은 연결
   * 성립 직후 `#flushPendingSubscriptions()`가 처리한다 (D3).
   */
  _subscribe(
    topic: string,
    callback: MqttMessageCallback,
    options?: unknown,
  ): void {
    if (topic.startsWith(SHARED_SUBSCRIPTION_PREFIX)) {
      this.onErrorCallback?.(
        new Error(`Shared subscription is not supported: ${topic}`),
      );
      return;
    }

    const existing = this.subscriptions[topic];
    if (existing) {
      existing.callbacks.add(callback);
      return;
    }

    this.subscriptions[topic] = {
      filter: topic,
      callbacks: new Set([callback]),
      options,
      registered: false,
    };

    this.#registerWithBroker(topic);
  }

  /**
   * 레코드만 지우면 브로커가 계속 메시지를 보낸다. 실제 해제까지 요청한다.
   */
  _unsubscribe(topic: string): void {
    this.client?.unsubscribe(topic, undefined, (error) => {
      this.#reportFailure(error, `unsubscribe ${topic}`);
    });
    delete this.subscriptions[topic];
  }

  _publish(topic: string, message: string, options?: unknown): void {
    this.client?.publish(topic, message, options, (error) => {
      this.#reportFailure(error, `publish ${topic}`);
    });
  }

  _isSubscribed(topic: string): boolean {
    return this.subscriptions[topic] !== undefined;
  }

  public send(_data: string): void {
    throw new Error('Method not implemented.');
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

  public networkStatus(): number {
    return this.client?.connected ? WebSocket.OPEN : WebSocket.CLOSED;
  }

  #registerWithBroker(topic: string): void {
    const subscription = this.subscriptions[topic];
    if (!subscription || !this.client?.connected) {
      return;
    }

    subscription.registered = true;
    this.client.subscribe(topic, subscription.options, (error) => {
      this.#reportFailure(error, `subscribe ${topic}`);
    });
  }

  #flushPendingSubscriptions(): void {
    for (const subscription of Object.values(this.subscriptions)) {
      if (!subscription.registered) {
        this.#registerWithBroker(subscription.filter);
      }
    }
  }

  #reportFailure(error: Error | null | undefined, action: string): void {
    if (!error) {
      return;
    }

    this.onErrorCallback?.(new Error(`${action} failed: ${error.message}`));
  }

  /**
   * MQTT는 모든 메시지가 하나의 `message` 이벤트로 들어오므로 수신 topic을
   * 구독 필터와 맞춰 분배한다. 구독별 콜백을 먼저 호출한 뒤 `WebSocketClient`
   * 파이프라인(플러그인 → 리스너 → `messages$`)으로 넘긴다.
   */
  #deliver(topic: string, message: string): void {
    for (const subscription of Object.values(this.subscriptions)) {
      if (!isTopicMatch(subscription.filter, topic)) {
        continue;
      }

      for (const callback of subscription.callbacks) {
        callback(message, topic);
      }
    }

    this.onMessageCallback(message);
  }
}
