import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type WebSocket as NodeWebSocket, WebSocketServer } from 'ws';

import {
  WebSocketClient,
  type WebSocketClientOptions,
} from '../../WebSocketClient';
import { StompWebSocketClient } from './StompWebSocketClient';
import { StompWebSocketClientAdapter } from './StompWebSocketClientAdapter';

interface StompFrame {
  command: string;
  headers: Record<string, string>;
  body: string;
}

// 계약 테스트가 어느 브로커를 상대하는지 알려주는 최소 정보.
interface StompTarget {
  url: string;
  connectHeaders: Record<string, string>;
}

// 실제 브로커 티어는 URL 이 주어질 때만 돈다. `npm run stomp:up` 이
// docker-compose.test.yml 의 RabbitMQ Web-STOMP 를 띄우고,
// `npm run test:integration:broker` 가 이 환경변수를 채운다.
const realBrokerUrl = process.env.WS_NETWORK_STOMP_URL;

function parseFrames(raw: string): StompFrame[] {
  return raw
    .split('\0')
    .map((chunk) => chunk.replace(/^\n+/, ''))
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => {
      const [head, ...bodyParts] = chunk.split('\n\n');
      const [command, ...headerLines] = head.split('\n');
      const headers: Record<string, string> = {};
      for (const line of headerLines) {
        const separator = line.indexOf(':');
        if (separator > 0) {
          headers[line.slice(0, separator)] = line.slice(separator + 1);
        }
      }
      return { command, headers, body: bodyParts.join('\n\n') };
    });
}

function serializeFrame(frame: StompFrame): string {
  const headerLines = Object.entries(frame.headers).map(
    ([name, value]) => `${name}:${value}`,
  );
  return [frame.command, ...headerLines, '', `${frame.body}\0`].join('\n');
}

// 인프로세스 STOMP 1.2 브로커. 테스트 더블이 아니라 실제 프레임을 말하는
// 서버다. CONNECT / SUBSCRIBE / UNSUBSCRIBE / SEND / DISCONNECT 만 다룬다.
// 이 클라이언트가 쓰는 프레임이 그것뿐이다. 프레임 문법을 내가 직접 구현한
// 만큼, 이 브로커만으로는 상호운용을 증명하지 못한다 — 그래서 같은 계약을
// 실제 RabbitMQ 에도 돌린다.
function startStompBroker() {
  const server = new WebSocketServer({ port: 0 });
  const subscriptions: {
    socket: NodeWebSocket;
    id: string;
    destination: string;
  }[] = [];
  const received: StompFrame[] = [];
  let messageId = 0;

  function deliver(destination: string, body: string, contentType: string) {
    messageId += 1;
    for (const subscription of subscriptions) {
      if (subscription.destination !== destination) {
        continue;
      }
      subscription.socket.send(
        serializeFrame({
          command: 'MESSAGE',
          headers: {
            destination,
            subscription: subscription.id,
            'message-id': String(messageId),
            'content-type': contentType,
          },
          body,
        }),
      );
    }
  }

  server.on('connection', (socket) => {
    socket.on('message', (data) => {
      for (const frame of parseFrames(data.toString())) {
        received.push(frame);

        if (frame.command === 'CONNECT' || frame.command === 'STOMP') {
          socket.send(
            serializeFrame({
              command: 'CONNECTED',
              headers: { version: '1.2', 'heart-beat': '0,0' },
              body: '',
            }),
          );
          continue;
        }

        if (frame.command === 'SUBSCRIBE') {
          subscriptions.push({
            socket,
            id: frame.headers.id,
            destination: frame.headers.destination,
          });
          continue;
        }

        if (frame.command === 'UNSUBSCRIBE') {
          const index = subscriptions.findIndex(
            (subscription) =>
              subscription.socket === socket &&
              subscription.id === frame.headers.id,
          );
          if (index >= 0) {
            subscriptions.splice(index, 1);
          }
          continue;
        }

        if (frame.command === 'SEND') {
          deliver(
            frame.headers.destination,
            frame.body,
            frame.headers['content-type'] ?? 'text/plain',
          );
          continue;
        }

        if (frame.command === 'DISCONNECT') {
          socket.close();
        }
      }
    });
  });

  const ready = new Promise<void>((resolve) => {
    server.on('listening', () => resolve());
  });

  return {
    ready,
    received,
    subscriptions,
    get url() {
      const address = server.address();
      if (typeof address === 'string' || address === null) {
        throw new Error('stomp broker has no port');
      }
      return `ws://127.0.0.1:${address.port}`;
    },
    // 브로커가 먼저 밀어주는 경로. 클라이언트 publish 를 거치지 않는다.
    publish(destination: string, body: string) {
      deliver(destination, body, 'text/plain');
    },
    close() {
      return new Promise<void>((resolve) => {
        for (const socket of server.clients) {
          socket.terminate();
        }
        server.close(() => resolve());
      });
    },
  };
}

function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error('waitFor timed out'));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

// 브로커를 공유하는 티어(RabbitMQ)에서 테스트끼리 목적지가 겹치면 안 된다.
// `/topic/` 접두사는 RabbitMQ Web-STOMP 와 인프로세스 브로커 둘 다 받는다.
function uniqueTopic(name: string): string {
  return `/topic/${name}-${randomUUID()}`;
}

// 구독이 브로커에 등록됐는지 확인하는 표준 API 가 STOMP 클라이언트에 없다.
// 고정 대기(`delay(100)`)는 부하 걸린 CI 에서 깨진다. 대신 프로브 메시지를
// 목적지로 계속 쏘고, 하나라도 돌아오면 등록된 것으로 본다. 늦게 도착한
// 프로브는 `withoutProbes` 로 걸러낸다.
const PROBE = '__subscription-probe__';

async function awaitSubscription(
  publishProbe: () => void,
  received: () => string[],
): Promise<void> {
  const startedAt = Date.now();
  while (!received().includes(PROBE)) {
    if (Date.now() - startedAt > 5000) {
      throw new Error('subscription probe timed out');
    }
    publishProbe();
    await delay(50);
  }
}

function withoutProbes(bodies: string[]): string[] {
  return bodies.filter((body) => body !== PROBE);
}

// 두 티어가 공유하는 계약. 브로커 내부를 들여다보지 않고 공개 API 만 쓴다.
function defineStompContract(getTarget: () => StompTarget) {
  let tracked: { disconnect(): void } | undefined;

  afterEach(() => {
    tracked?.disconnect();
    tracked = undefined;
  });

  function createClient(
    options?: WebSocketClientOptions,
  ): StompWebSocketClient {
    const target = getTarget();
    const client = new StompWebSocketClient({
      brokerURL: target.url,
      connectHeaders: target.connectHeaders,
      reconnectDelay: 0,
      ...options,
    });
    tracked = client;
    return client;
  }

  it('completes the CONNECT handshake and fires onConnect', async () => {
    const client = createClient();
    const connected = new Promise<void>((resolve) => {
      client.onConnect(() => resolve());
    });

    await client.connect();

    await connected;
  });

  it('delivers a published message back to its own subscriber', async () => {
    const client = createClient();
    const topic = uniqueTopic('chat');

    await client.connect();

    const bodies: string[] = [];
    client.subscribe(topic, (message) => bodies.push(message));
    await awaitSubscription(
      () => client.publish(topic, PROBE),
      () => bodies,
    );

    client.publish(topic, '안녕');
    await waitFor(() => withoutProbes(bodies).length === 1);

    expect(withoutProbes(bodies)).toEqual(['안녕']);
    expect(client.isSubscribed(topic)).toBe(true);
  });

  it('subscribes to and publishes on every topic in an array', async () => {
    const client = createClient();
    const topics = [uniqueTopic('a'), uniqueTopic('b')];

    await client.connect();

    const bodies: string[] = [];
    client.subscribe(topics, (message) => bodies.push(message));
    await awaitSubscription(
      () => client.publish(topics, PROBE),
      () => bodies,
    );

    client.publish(topics, '둘 다');
    await waitFor(() => withoutProbes(bodies).length === 2);

    expect(withoutProbes(bodies)).toEqual(['둘 다', '둘 다']);
    expect(client.isSubscribed(topics)).toBe(true);
  });

  it('stops reporting a topic as subscribed after unsubscribe', async () => {
    const client = createClient();
    const topic = uniqueTopic('chat');

    await client.connect();
    const bodies: string[] = [];
    client.subscribe(topic, (message) => bodies.push(message));
    await awaitSubscription(
      () => client.publish(topic, PROBE),
      () => bodies,
    );

    client.unsubscribe(topic);

    expect(client.isSubscribed(topic)).toBe(false);
  });

  it('fires onClose when the broker connection goes away', async () => {
    const client = createClient();
    const closed = new Promise<void>((resolve) => {
      client.onClose(() => resolve());
    });

    await client.connect();
    client.disconnect();

    await closed;
  });

  it('runs connect and disconnect hooks for a facade client', async () => {
    const calls: string[] = [];
    const client = createClient({
      plugins: [
        {
          name: 'RecordingPlugin',
          onBeforeConnect: () => {
            calls.push('onBeforeConnect');
          },
          onAfterConnect: () => {
            calls.push('onAfterConnect');
          },
          onBeforeDisconnect: () => {
            calls.push('onBeforeDisconnect');
          },
          onAfterDisconnect: () => {
            calls.push('onAfterDisconnect');
          },
        },
      ],
    });

    await client.connect();
    await client.disconnectAsync();

    expect(calls).toEqual([
      'onBeforeConnect',
      'onAfterConnect',
      'onBeforeDisconnect',
      'onAfterDisconnect',
    ]);
  });

  it('runs send hooks on publish and delivers the transformed body', async () => {
    const calls: string[] = [];
    const client = createClient({
      plugins: [
        {
          name: 'TransformingPlugin',
          // 구독 준비를 확인하는 프로브는 변환하지 않는다. 그래야
          // `awaitSubscription` 과 `withoutProbes` 가 그대로 동작한다.
          onBeforeSend: (data) => {
            calls.push('onBeforeSend');
            return data === PROBE ? data : `${data}!`;
          },
          onAfterSend: () => {
            calls.push('onAfterSend');
          },
        },
      ],
    });
    const topic = uniqueTopic('send-hooks');

    await client.connect();
    const bodies: string[] = [];
    client.subscribe(topic, (message) => bodies.push(message));
    await awaitSubscription(
      () => client.publish(topic, PROBE),
      () => bodies,
    );

    await client.publishAsync(topic, '변환 전');
    await waitFor(() => withoutProbes(bodies).length === 1);

    expect(withoutProbes(bodies)).toEqual(['변환 전!']);
    expect(calls).toContain('onBeforeSend');
    expect(calls).toContain('onAfterSend');
  });

  it('runs plugin hooks when the adapter is composed with WebSocketClient', async () => {
    const target = getTarget();
    const topic = uniqueTopic('plugin');
    const calls: string[] = [];
    const inbound: string[] = [];
    const adapter = new StompWebSocketClientAdapter({
      brokerURL: target.url,
      connectHeaders: target.connectHeaders,
      reconnectDelay: 0,
    });
    const composed = new WebSocketClient(adapter, {
      plugins: [
        {
          name: 'RecordingPlugin',
          onBeforeConnect: () => {
            calls.push('onBeforeConnect');
          },
          onAfterConnect: () => {
            calls.push('onAfterConnect');
          },
          onMessage: (data) => {
            inbound.push(data);
          },
        },
      ],
    });
    tracked = composed;

    await composed.connect();
    adapter.subscribe(topic, () => {});
    await awaitSubscription(
      () => adapter.publish(topic, PROBE),
      () => inbound,
    );

    adapter.publish(topic, '플러그인까지');
    await waitFor(() => withoutProbes(inbound).length === 1);

    expect(calls).toEqual(['onBeforeConnect', 'onAfterConnect']);
    expect(withoutProbes(inbound)).toEqual(['플러그인까지']);
  });

  it('feeds inbound messages into the core listener', async () => {
    const client = createClient();
    const topic = uniqueTopic('core');

    await client.connect();

    const fromCore: string[] = [];
    const fromStream: string[] = [];
    const fromSubscription: string[] = [];
    client.onMessage((message) => fromCore.push(message));
    client.messages$.subscribe((message) => fromStream.push(message));
    client.subscribe(topic, (message) => fromSubscription.push(message));
    await awaitSubscription(
      () => client.publish(topic, PROBE),
      () => fromSubscription,
    );

    client.publish(topic, '코어까지');
    await waitFor(() => withoutProbes(fromCore).length === 1);

    expect(withoutProbes(fromCore)).toEqual(['코어까지']);
    expect(withoutProbes(fromStream)).toEqual(['코어까지']);
  });

  it('stops receiving broker messages after unsubscribe', async () => {
    const client = createClient();
    const topic = uniqueTopic('chat');

    await client.connect();
    const bodies: string[] = [];
    client.subscribe(topic, (message) => bodies.push(message));
    await awaitSubscription(
      () => client.publish(topic, PROBE),
      () => bodies,
    );

    client.unsubscribe(topic);
    client.publish(topic, '구독 해제 후');
    await delay(300);

    expect(withoutProbes(bodies)).toEqual([]);
  });

  it('reports the socket status', async () => {
    const client = createClient();

    await client.connect();

    expect(client.status()).toBe(WebSocket.OPEN);

    client.disconnect();
    await waitFor(() => client.status() === WebSocket.CLOSED);

    expect(client.status()).toBe(WebSocket.CLOSED);
  });
}

describe('StompWebSocketClient against an in-process broker', () => {
  let broker: ReturnType<typeof startStompBroker>;

  beforeEach(async () => {
    broker = startStompBroker();
    await broker.ready;
  });

  afterEach(async () => {
    await broker.close();
  });

  defineStompContract(() => ({
    url: broker.url,
    connectHeaders: { login: 'tester' },
  }));

  // 프레임을 들여다보는 테스트는 인프로세스 브로커에서만 가능하다.
  it('sends the configured connectHeaders on the CONNECT frame', async () => {
    const client = new StompWebSocketClient({
      brokerURL: broker.url,
      connectHeaders: { login: 'tester' },
      reconnectDelay: 0,
    });

    await client.connect();
    const connectFrame = broker.received.find(
      (frame) => frame.command === 'CONNECT' || frame.command === 'STOMP',
    );

    expect(connectFrame?.headers.login).toBe('tester');
    expect(connectFrame?.headers['accept-version']).toContain('1.2');
    client.disconnect();
  });

  it('delivers a broker-initiated message to a subscriber', async () => {
    const client = new StompWebSocketClient({
      brokerURL: broker.url,
      reconnectDelay: 0,
    });

    await client.connect();
    const bodies: string[] = [];
    client.subscribe('/topic/push', (message) => bodies.push(message));
    await waitFor(() => broker.subscriptions.length === 1);
    broker.publish('/topic/push', '서버 푸시');
    await waitFor(() => bodies.length === 1);

    expect(bodies).toEqual(['서버 푸시']);
    client.disconnect();
  });
});

// 실제 브로커 티어. URL 이 없으면 통째로 skip 한다 — docker 없는 머신과 CI
// 브랜치에서도 통합 티어가 돌아야 한다.
describe.skipIf(!realBrokerUrl)(
  'StompWebSocketClient against a real broker',
  () => {
    defineStompContract(() => ({
      url: realBrokerUrl as string,
      // docker-compose.test.yml 이 만드는 계정.
      connectHeaders: { login: 'test', passcode: 'test' },
    }));
  },
);
