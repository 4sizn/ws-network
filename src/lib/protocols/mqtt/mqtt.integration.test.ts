import net, { type AddressInfo } from 'node:net';

import { Aedes } from 'aedes';
import mqtt from 'mqtt';

const { connect } = mqtt;
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { MqttWebSocketClient } from './MqttWebSocketClient';
import { isTopicMatch } from './topicMatch';

/**
 * 실제 브로커 대상 통합 테스트. 페이크는 이 파일에 등장하지 않는다 — 페이크가
 * 구조적으로 증명할 수 없는 것만 여기서 본다:
 *
 * - `isTopicMatch`가 브로커의 실제 와일드카드 매칭과 일치하는가 (우리 구현은
 *   브로커 로직의 복제품이라 divergence가 단위 테스트로는 절대 안 잡힌다)
 * - QoS·retain 옵션이 실제로 효력이 있는가
 * - 연결 실패 시 실제 `'error'` 이벤트로 `connect()`가 reject되는가
 * - 연결 전 구독이 실제 브로커에 등록되는가
 * - mqtt의 오버로드 런타임 처리가 우리 호출 방식과 맞는가
 *
 * 기본은 인프로세스 aedes 브로커를 **TCP**(`mqtt://`)로 띄운다 — 오프라인·CI에서
 * 그대로 돈다. 어댑터는 전송 방식에 무관하고(주입된 `connect`가 전송을 정한다)
 * 프로토콜 의미론은 이 티어로 전부 덮인다.
 *
 * **덮이지 않는 것: WebSocket 전송 경로.** `ws://`로 서비스하는 브로커를
 * `MQTT_TEST_BROKER_URL`로 주면 이 테스트가 그대로 그 브로커를 겨냥하므로 ws
 * 경로까지 검증된다. 브라우저 경로는 README의 수동 데모 티어가 맡는다.
 */

const externalBrokerURL = process.env.MQTT_TEST_BROKER_URL;

/**
 * `TOptions` 가 파라미터 위치에 나타나므로 `MqttWebSocketClient<unknown>` 에는
 * 대입되지 않는다. 주입한 `connect` 에서 옵션 타입을 그대로 끌어와 쓴다.
 */
type InjectedClient = MqttWebSocketClient<
  NonNullable<Parameters<typeof connect>[1]>
>;

let broker: Aedes | undefined;
let server: net.Server | undefined;
let brokerURL = externalBrokerURL ?? '';

const clients: InjectedClient[] = [];

function track(client: InjectedClient): InjectedClient {
  clients.push(client);
  return client;
}

function makeClient(clientId: string): InjectedClient {
  return track(
    new MqttWebSocketClient({
      brokerURL,
      connect,
      connectOptions: { clientId, clean: true, reconnectPeriod: 0 },
    }),
  );
}

/** 브로커 왕복은 비동기라 조건이 성립할 때까지 짧게 폴링한다. */
async function until(
  predicate: () => boolean,
  label: string,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`timed out waiting for ${label}`);
}

beforeAll(async () => {
  if (externalBrokerURL) {
    return;
  }

  // aedes 1.x 는 default export 생성자를 없애고 createBroker() 만 남겼다.
  broker = await Aedes.createBroker();
  const handle = broker.handle;
  server = net.createServer((connection) => handle(connection));

  await new Promise<void>((resolve) => {
    server?.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  brokerURL = `mqtt://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  while (clients.length > 0) {
    clients.pop()?.disconnect();
  }
  // 브로커가 세션을 정리할 틈을 준다.
  await new Promise((resolve) => setTimeout(resolve, 20));
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });

  await new Promise<void>((resolve) => {
    if (!broker) {
      resolve();
      return;
    }
    broker.close(() => resolve());
  });
});

describe('MqttWebSocketClient against a real broker', () => {
  it('connects with the injected mqtt module and round-trips a message', async () => {
    const client = makeClient('roundtrip');
    const received: { message: string; topic: string }[] = [];

    client.subscribe('chat/room', (message, topic) => {
      received.push({ message, topic });
    });

    await client.connect();
    await until(() => client.isSubscribed('chat/room'), 'subscription');

    client.publish('chat/room', '안녕하세요');

    await until(() => received.length === 1, 'message');
    expect(received[0]).toEqual({
      message: '안녕하세요',
      topic: 'chat/room',
    });
  });

  it('agrees with the broker on wildcard matching', async () => {
    const client = makeClient('wildcard');
    const delivered: string[] = [];

    client.subscribe('sensor/+/temp', (_message, topic) => {
      delivered.push(topic);
    });
    client.subscribe('alarm/#', (_message, topic) => {
      delivered.push(topic);
    });

    await client.connect();
    await until(
      () => client.isSubscribed(['sensor/+/temp', 'alarm/#']),
      'subscriptions',
    );

    // 브로커가 실제로 어느 topic을 배달하는지와 isTopicMatch 의 판정을 맞춘다.
    const candidates = [
      'sensor/a/temp',
      'sensor/a/b/temp',
      'sensor/a/humidity',
      'alarm/fire',
      'alarm/zone/1/fire',
      'other/topic',
    ];
    const expected = candidates.filter(
      (topic) =>
        isTopicMatch('sensor/+/temp', topic) || isTopicMatch('alarm/#', topic),
    );

    const publisher = makeClient('wildcard-publisher');
    await publisher.connect();
    for (const topic of candidates) {
      publisher.publish(topic, 'x');
    }

    await until(
      () => delivered.length >= expected.length,
      `${expected.length} deliveries, got ${delivered.length}`,
    );
    // 여분 배달이 없는지 확인할 여유를 준다.
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect([...delivered].sort()).toEqual([...expected].sort());
    expect(expected).toEqual([
      'sensor/a/temp',
      'alarm/fire',
      'alarm/zone/1/fire',
    ]);
  });

  it('registers a subscription made before connect (D3)', async () => {
    const client = makeClient('pre-subscribe');
    const received: string[] = [];

    // connect() 전에 구독한다 — 버려지면 이 테스트가 실패한다.
    client.subscribe('early/topic', (message) => {
      received.push(message);
    });

    await client.connect();
    await until(() => client.isSubscribed('early/topic'), 'subscription');

    const publisher = makeClient('pre-subscribe-publisher');
    await publisher.connect();
    publisher.publish('early/topic', 'delivered');

    await until(() => received.length === 1, 'message');
    expect(received).toEqual(['delivered']);
  });

  it('honours qos and retain options end to end (S1)', async () => {
    const publisher = makeClient('retain-publisher');
    await publisher.connect();
    publisher.publish('retained/topic', 'kept', { qos: 1, retain: true });

    // retain 이 실제로 걸렸다면, 나중에 붙는 구독자가 즉시 값을 받는다.
    await new Promise((resolve) => setTimeout(resolve, 150));

    const late = makeClient('retain-subscriber');
    const received: string[] = [];
    late.subscribe(
      'retained/topic',
      (message) => {
        received.push(message);
      },
      { qos: 1 },
    );
    await late.connect();

    await until(() => received.length === 1, 'retained message');
    expect(received).toEqual(['kept']);
  });

  it('stops delivering after unsubscribe (AC8)', async () => {
    const client = makeClient('unsubscribe');
    const received: string[] = [];

    client.subscribe('drop/me', (message) => {
      received.push(message);
    });
    await client.connect();
    await until(() => client.isSubscribed('drop/me'), 'subscription');

    const publisher = makeClient('unsubscribe-publisher');
    await publisher.connect();
    publisher.publish('drop/me', 'first');
    await until(() => received.length === 1, 'first message');

    client.unsubscribe('drop/me');
    await new Promise((resolve) => setTimeout(resolve, 150));

    publisher.publish('drop/me', 'second');
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(received).toEqual(['first']);
  });

  it('reports OPEN while connected and CLOSED after disconnect (AC7)', async () => {
    const client = makeClient('status');
    expect(client.status()).toBe(WebSocket.CLOSED);

    await client.connect();
    expect(client.status()).toBe(WebSocket.OPEN);

    client.disconnect();
    await until(() => client.status() === WebSocket.CLOSED, 'closed status');
  });

  it('rejects connect against a broker that is not listening (B1)', async () => {
    // 아무도 듣지 않는 포트. reject 되지 않으면 이 테스트가 타임아웃으로
    // 실패하므로, 영구 hang 회귀를 잡아낸다.
    const client = track(
      new MqttWebSocketClient({
        brokerURL: 'mqtt://127.0.0.1:1',
        connect,
        connectOptions: { clientId: 'no-broker', reconnectPeriod: 0 },
      }),
    );

    await expect(client.connect()).rejects.toThrowError();
  });
});
