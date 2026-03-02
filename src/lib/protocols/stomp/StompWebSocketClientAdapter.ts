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

export interface StompWebSocketClientAdapterOptions {
  brokerURL: string;
  connectHeaders?: Record<string, string>;
  heartbeatIncoming?: number;
  heartbeatOutgoing?: number;
  reconnectDelay?: number;
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
      callback(typeof body === 'string' ? body : '');
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
        'content-type': 'application/json',
      },
    });
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
    headers = {
      'content-type': 'application/json',
    },
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
    throw new Error('Method not implemented.');
  }
}
