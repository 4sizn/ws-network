import {
  WebSocketClient,
  type WebSocketClientOptions,
} from '../../WebSocketClient';
import {
  type IMqttClient,
  type MqttMessageCallback,
  MqttWebSocketClientAdapter,
  type MqttWebSocketClientAdapterOptions,
} from './MqttWebSocketClientAdapter';

export type MqttWebSocketClientOptions<TOptions = unknown> =
  MqttWebSocketClientAdapterOptions<TOptions> & WebSocketClientOptions;

/**
 * `connect()` / `disconnect()`를 오버라이드하지 않는다. `WebSocketClient`가
 * 플러그인 훅(`onBeforeConnect` → adapter connect → `onAfterConnect`)으로
 * 감싸고 있어서, 오버라이드하면 README에 문서화된 그 순서가 죽는다.
 */
export class MqttWebSocketClient<
  TOptions = unknown,
> extends WebSocketClient<IMqttClient> {
  constructor(options: MqttWebSocketClientOptions<TOptions>) {
    super(
      new MqttWebSocketClientAdapter<TOptions>({
        brokerURL: options.brokerURL,
        connect: options.connect,
        connectOptions: options.connectOptions,
      }),
      {
        plugins: options.plugins,
        logger: options.logger,
      },
    );
  }

  private get adapter(): MqttWebSocketClientAdapter<TOptions> {
    return this.client as MqttWebSocketClientAdapter<TOptions>;
  }

  publish(
    topic: string | string[],
    message: string,
    options?: unknown,
  ): void {
    this.adapter.publish(topic, message, options);
  }

  subscribe(
    topic: string | string[],
    callback: MqttMessageCallback,
    options?: unknown,
  ): void {
    this.adapter.subscribe(topic, callback, options);
  }

  unsubscribe(topic: string | string[]): void {
    this.adapter.unsubscribe(topic);
  }

  isSubscribed(topic: string | string[]): boolean {
    return this.adapter.isSubscribed(topic);
  }
}
