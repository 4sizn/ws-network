/**
 * MQTT 프로토콜의 공개 표면.
 *
 * ## 클라이언트를 만드는 두 방법
 *
 * ### 1. 조립 (권장)
 *
 * ```ts
 * const adapter = new MqttWebSocketClientAdapter({
 *   brokerURL, connect: mqtt.connect,
 * });
 * const client = new WebSocketClient(adapter, {
 *   plugins: [new LoggingPlugin(console)],
 *   logger: console,
 * });
 *
 * await client.connect();          // 생명주기 · 플러그인 훅 · messages$
 * adapter.subscribe('sensor/+/temp', (message, topic) => { ... });
 * adapter.publish('sensor/a/temp', '21.5', { qos: 1 });
 * ```
 *
 * `plugins`/`logger` 를 어디에 넘기는지 호출부에 드러나고, 어댑터만 바꿔
 * 전송을 갈아끼우며, 테스트가 페이크 어댑터를 그대로 주입한다.
 * 대가: pub/sub 이라 표면이 두 객체로 갈린다 (생명주기는 `client`,
 * 발행·구독은 `adapter`).
 *
 * ### 2. 편의 클래스
 *
 * ```ts
 * const client = new MqttWebSocketClient({ brokerURL, connect: mqtt.connect });
 * await client.connect();
 * client.subscribe('sensor/+/temp', (message, topic) => { ... });
 * ```
 *
 * ## 표면
 *
 * 입구 2쌍 (`생성자 + 옵션`), 출구 2개 (주입 계약). 구독 레코드와 콜백 별칭은
 * 내부 구현이라 내보내지 않는다.
 */

// 출구 — 호출자가 넣어주는 주입 계약
export {
  type IMqttClient,
  type MqttConnect,
} from './MqttWebSocketClientAdapter';

// 입구 1: 조립 (권장)
export {
  MqttWebSocketClientAdapter,
  type MqttWebSocketClientAdapterOptions,
} from './MqttWebSocketClientAdapter';

// 입구 2: 편의 클래스
export {
  MqttWebSocketClient,
  type MqttWebSocketClientOptions,
} from './MqttWebSocketClient';
