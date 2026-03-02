import { Client as StompClient, StompSubscription } from '@stomp/stompjs';

export interface StompWebSocketClientAdapterOptions {
  brokerURL: string;
  connectHeaders?: Record<string, string>;
  heartbeatIncoming?: number;
  heartbeatOutgoing?: number;
  reconnectDelay?: number;
}

export type StompListenerUnsubscribe = () => void;

export class StompWebSocketClientAdapter {
  #brokerURL: string;
  #connectHeaders?: Record<string, string>;
  #heartbeatIncoming: number;
  #heartbeatOutgoing: number;
  #reconnectDelay: number;
  #client?: StompClient;
  #onConnectListeners: Set<() => void>;
  #onCloseListeners: Set<() => void>;
  #onErrorListeners: Set<(error: Error) => void>;
  #subscriptions: Record<string, StompSubscription> = {};

  constructor(
    options: StompWebSocketClientAdapterOptions,
    client?: StompClient,
  ) {
    this.#brokerURL = options.brokerURL;
    this.#connectHeaders = options.connectHeaders;
    this.#heartbeatIncoming = options.heartbeatIncoming ?? 0;
    this.#heartbeatOutgoing = options.heartbeatOutgoing ?? 0;
    this.#reconnectDelay = options.reconnectDelay ?? 5000;
    this.#client = client;
    this.#onConnectListeners = new Set();
    this.#onCloseListeners = new Set();
    this.#onErrorListeners = new Set();
  }

  connect(): Promise<void> {
    if (!this.#client) {
      this.#client = new StompClient({
        brokerURL: this.#brokerURL,
        heartbeatIncoming: this.#heartbeatIncoming,
        heartbeatOutgoing: this.#heartbeatOutgoing,
        reconnectDelay: this.#reconnectDelay,
        connectHeaders: this.#connectHeaders,
      });

      this.#client.onConnect = () => {
        for (const listener of this.#onConnectListeners) {
          listener();
        }
      };
      this.#client.onStompError = (frame) => {
        const body = (frame as { body?: unknown }).body;
        const message = typeof body === 'string' ? body : 'STOMP error';
        this.#emitError(new Error(message));
      };
      this.#client.onWebSocketError = (event) => {
        this.#emitError(
          new Error(`WebSocket error: ${(event as { type?: unknown }).type ?? ''}`),
        );
      };
      this.#client.onWebSocketClose = () => {
        this.#clearSubscriptions();
        for (const listener of this.#onCloseListeners) {
          listener();
        }
      };
      this.#client.onDisconnect = () => {
        this.#clearSubscriptions();
        for (const listener of this.#onCloseListeners) {
          listener();
        }
      };
    }

    if (this.#client.connected || this.#client.active) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const unsubscribe = this.onConnect(() => {
        unsubscribe();
        resolve();
      });
      this.#client?.activate();
    });
  }

  disconnect(): void {
    this.#client?.deactivate();
  }

  publish(
    destination: string,
    message: string,
    headers: Record<string, string> = {
      'content-type': 'application/json',
    },
  ): void {
    this.#client?.publish({
      destination,
      body: message,
      headers,
    });
  }

  subscribe(destination: string, callback: (message: string) => void): void {
    if (!this.#client) {
      return;
    }

    if (this.#subscriptions[destination]) {
      this.#subscriptions[destination].unsubscribe();
    }

    const subscription = this.#client.subscribe(destination, (message) => {
      const body = (message as { body?: unknown }).body;
      callback(typeof body === 'string' ? body : '');
    });

    this.#subscriptions[destination] = subscription;
  }

  unsubscribe(destination: string): void {
    this.#subscriptions[destination]?.unsubscribe();
    delete this.#subscriptions[destination];
  }

  onConnect(callback: () => void): StompListenerUnsubscribe {
    this.#onConnectListeners.add(callback);
    return () => {
      this.#onConnectListeners.delete(callback);
    };
  }

  onClose(callback: () => void): StompListenerUnsubscribe {
    this.#onCloseListeners.add(callback);
    return () => {
      this.#onCloseListeners.delete(callback);
    };
  }

  onError(callback: (error: Error) => void): StompListenerUnsubscribe {
    this.#onErrorListeners.add(callback);
    return () => {
      this.#onErrorListeners.delete(callback);
    };
  }

  #clearSubscriptions(): void {
    this.#subscriptions = {};
  }

  #emitError(error: Error): void {
    for (const listener of this.#onErrorListeners) {
      listener(error);
    }
  }
}
