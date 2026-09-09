import { Client as StompClient } from '@stomp/stompjs';
import {
  WebSocketClient,
  type WebSocketClientOptions,
} from '../../WebSocketClient';
import {
  type StompSendOptions,
  StompWebSocketClientAdapter,
  type StompWebSocketClientAdapterOptions,
} from './StompWebSocketClientAdapter';

export type StompWebSocketClientOptions = StompWebSocketClientAdapterOptions &
  WebSocketClientOptions;

export class StompWebSocketClient extends WebSocketClient<
  StompClient,
  StompSendOptions
> {
  constructor(options: StompWebSocketClientOptions) {
    super(new StompWebSocketClientAdapter(options), {
      plugins: options.plugins,
      logger: options.logger,
    });
  }

  private get adapter(): StompWebSocketClientAdapter {
    return this.client as StompWebSocketClientAdapter;
  }

  publish(topic: string | string[], message: string): void {
    this.send(message, { destination: topic });
  }

  publishAsync(topic: string | string[], message: string): Promise<void> {
    return this.sendAsync(message, { destination: topic });
  }

  subscribe(
    topic: string | string[],
    callback: (message: string) => void,
  ): void {
    this.adapter.subscribe(topic, callback);
  }

  unsubscribe(topic: string | string[]): void {
    this.adapter.unsubscribe(topic);
  }

  isSubscribed(topic: string | string[]): boolean {
    return this.adapter.isSubscribed(topic);
  }
}
