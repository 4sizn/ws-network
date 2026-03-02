import {
  StompWebSocketClientAdapter,
  type StompListenerUnsubscribe,
  type StompWebSocketClientAdapterOptions,
} from './StompWebSocketClientAdapter';

export type StompPublishHeaders = Record<string, string>;

export class StompWebSocketClient {
  #client: StompWebSocketClientAdapter;

  constructor(options: StompWebSocketClientAdapterOptions) {
    this.#client = new StompWebSocketClientAdapter(options);
  }

  connect(): Promise<void> {
    return this.#client.connect();
  }

  disconnect(): void {
    this.#client.disconnect();
  }

  publish(
    destination: string,
    message: string,
    headers?: StompPublishHeaders,
  ): void {
    this.#client.publish(destination, message, headers);
  }

  subscribe(destination: string, callback: (message: string) => void): void {
    this.#client.subscribe(destination, callback);
  }

  unsubscribe(destination: string): void {
    this.#client.unsubscribe(destination);
  }

  onConnect(callback: () => void): StompListenerUnsubscribe {
    return this.#client.onConnect(callback);
  }

  onClose(callback: () => void): StompListenerUnsubscribe {
    return this.#client.onClose(callback);
  }

  onError(callback: (error: Error) => void): StompListenerUnsubscribe {
    return this.#client.onError(callback);
  }
}

export type { StompWebSocketClientAdapterOptions };
