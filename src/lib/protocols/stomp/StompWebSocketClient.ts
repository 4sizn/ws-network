import { Client as StompClient } from '@stomp/stompjs';
import { WebSocketClient } from '../../WebSocketClient';
import {
  StompWebSocketClientAdapter,
  type StompWebSocketClientAdapterOptions,
} from './StompWebSocketClientAdapter';

export class StompWebSocketClient extends WebSocketClient<StompClient> {
  constructor(options: StompWebSocketClientAdapterOptions) {
    super(new StompWebSocketClientAdapter(options));
  }

  connect(): Promise<void> {
    return this.client.connect();
  }

  disconnect() {
    this.client.disconnect();
  }

  private get adapter(): StompWebSocketClientAdapter {
    return this.client as StompWebSocketClientAdapter;
  }

  publish(topic: string | string[], message: string): void {
    this.adapter.publish(topic, message);
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
