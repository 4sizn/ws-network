import { connect } from 'mqtt';
import { describe, expect, it, vi } from 'vitest';

import {
  type IWebSocketPlugin,
  WebSocketClient,
} from '../../WebSocketClient';
import { MqttWebSocketClient } from './MqttWebSocketClient';
import {
  type IMqttClient,
  type MqttConnect,
  type MqttMessageListener,
  type MqttOperationCallback,
  MqttWebSocketClientAdapter,
} from './MqttWebSocketClientAdapter';

interface RecordedSubscribe {
  topic: string | string[];
  options?: unknown;
}

interface RecordedPublish {
  topic: string;
  message: string;
  options?: unknown;
}

/**
 * 테스트 전용 더블. `IMqttClient`를 실제로 구현해 구독·발행을 메모리에 담고,
 * `emit*` 헬퍼로 브로커 이벤트를 흘려보낸다. 실제 브로커 없이 어댑터와 파사드를
 * 검증하기 위한 것이며 프로덕션 코드에서 쓰지 않는다.
 * `src/lib/WebSocketClient.test.ts`의 `FakeAdapter`와 같은 역할이라 같은 방식으로
 * 테스트 파일 안에 인라인 선언한다 (export 하지 않는다).
 */
class FakeClient implements IMqttClient {
  connected = false;

  readonly subscribed: string[] = [];
  readonly unsubscribed: string[] = [];
  readonly published: RecordedPublish[] = [];
  readonly subscribeCalls: RecordedSubscribe[] = [];
  endCalls = 0;

  /** 다음 subscribe 호출을 이 에러로 실패시킨다 (D4 검증용) */
  failNextSubscribeWith?: Error;

  #connectListeners: (() => void)[] = [];
  #messageListeners: MqttMessageListener[] = [];
  #errorListeners: ((error: Error) => void)[] = [];
  #closeListeners: (() => void)[] = [];

  get listenerCounts(): Record<string, number> {
    return {
      connect: this.#connectListeners.length,
      message: this.#messageListeners.length,
      error: this.#errorListeners.length,
      close: this.#closeListeners.length,
    };
  }

  subscribe(
    topic: string | string[],
    options?: unknown,
    callback?: MqttOperationCallback,
  ): unknown {
    this.subscribeCalls.push({ topic, options });

    const failure = this.failNextSubscribeWith;
    if (failure) {
      this.failNextSubscribeWith = undefined;
      callback?.(failure);
      return this;
    }

    for (const one of toArray(topic)) {
      this.subscribed.push(one);
    }
    callback?.(null);
    return this;
  }

  unsubscribe(
    topic: string | string[],
    _options?: unknown,
    callback?: MqttOperationCallback,
  ): unknown {
    for (const one of toArray(topic)) {
      this.unsubscribed.push(one);
    }
    callback?.(null);
    return this;
  }

  publish(
    topic: string,
    message: string,
    options?: unknown,
    callback?: MqttOperationCallback,
  ): unknown {
    this.published.push({ topic, message, options });
    callback?.(null);
    return this;
  }

  end(): unknown {
    this.endCalls += 1;
    this.connected = false;
    for (const listener of this.#closeListeners) {
      listener();
    }
    return this;
  }

  on(event: string, listener: (...args: never[]) => void): unknown {
    if (event === 'connect') {
      this.#connectListeners.push(listener as unknown as () => void);
    }
    if (event === 'message') {
      this.#messageListeners.push(listener as unknown as MqttMessageListener);
    }
    if (event === 'error') {
      this.#errorListeners.push(listener as unknown as (error: Error) => void);
    }
    if (event === 'close') {
      this.#closeListeners.push(listener as unknown as () => void);
    }
    return this;
  }

  emitConnect(): void {
    this.connected = true;
    for (const listener of this.#connectListeners) {
      listener();
    }
  }

  emitMessage(topic: string, payload: Uint8Array): void {
    for (const listener of this.#messageListeners) {
      listener(topic, payload);
    }
  }

  emitError(error: Error): void {
    for (const listener of this.#errorListeners) {
      listener(error);
    }
  }
}

function toArray(topic: string | string[]): string[] {
  return typeof topic === 'string' ? [topic] : topic;
}

function encodePayload(message: string): Uint8Array {
  return new TextEncoder().encode(message);
}

function setup() {
  const client = new FakeClient();
  const injectedConnect = vi.fn(() => client);
  const adapter = new MqttWebSocketClientAdapter({
    brokerURL: 'wss://broker.test:8884/mqtt',
    connect: injectedConnect,
    connectOptions: { clientId: 'test-1' },
  });

  return { adapter, client, injectedConnect };
}

describe('MqttWebSocketClientAdapter', () => {
  it('builds its client from the injected connect factory', async () => {
    const { adapter, client, injectedConnect } = setup();

    const connecting = adapter.connect();
    client.emitConnect();
    await connecting;

    expect(injectedConnect).toHaveBeenCalledTimes(1);
    expect(injectedConnect).toHaveBeenCalledWith('wss://broker.test:8884/mqtt', {
      clientId: 'test-1',
    });
  });

  it('resolves connect and fires onConnect when the client connects', async () => {
    const { adapter, client } = setup();
    const onConnect = vi.fn();
    adapter.onConnect(onConnect);

    const connecting = adapter.connect();
    client.emitConnect();
    await connecting;

    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('reuses an injected client instead of calling the factory', async () => {
    const client = new FakeClient();
    const injectedConnect = vi.fn(() => new FakeClient());
    const adapter = new MqttWebSocketClientAdapter(
      {
        brokerURL: 'wss://broker.test:8884/mqtt',
        connect: injectedConnect,
      },
      client,
    );

    const connecting = adapter.connect();
    client.emitConnect();
    await connecting;

    expect(injectedConnect).not.toHaveBeenCalled();
  });

  it('delivers a message only to subscriptions whose filter matches', async () => {
    const { adapter, client } = setup();
    const connecting = adapter.connect();
    client.emitConnect();
    await connecting;

    const wildcard = vi.fn();
    const other = vi.fn();
    adapter.subscribe('sensor/+/temp', wildcard);
    adapter.subscribe('alarm/#', other);

    client.emitMessage('sensor/a/temp', encodePayload('21.5'));

    expect(wildcard).toHaveBeenCalledWith('21.5', 'sensor/a/temp');
    expect(other).not.toHaveBeenCalled();

    client.emitMessage('sensor/a/b/temp', encodePayload('ignored'));
    expect(wildcard).toHaveBeenCalledTimes(1);
  });

  it('decodes a binary payload as UTF-8', async () => {
    const { adapter, client } = setup();
    const connecting = adapter.connect();
    client.emitConnect();
    await connecting;

    const received = vi.fn();
    adapter.subscribe('chat/room', received);

    client.emitMessage('chat/room', encodePayload('안녕하세요'));

    expect(received).toHaveBeenCalledWith('안녕하세요', 'chat/room');
  });

  it('subscribes and publishes across an array of topics', async () => {
    const { adapter, client } = setup();
    const connecting = adapter.connect();
    client.emitConnect();
    await connecting;

    adapter.subscribe(['a/1', 'a/2'], vi.fn());
    adapter.publish(['a/1', 'a/2'], 'payload');

    expect(client.subscribed).toEqual(['a/1', 'a/2']);
    expect(client.published).toEqual([
      { topic: 'a/1', message: 'payload' },
      { topic: 'a/2', message: 'payload' },
    ]);
    expect(adapter.isSubscribed(['a/1', 'a/2'])).toBe(true);
  });

  it('tells the broker about an unsubscribe, not only its own record', async () => {
    const { adapter, client } = setup();
    const connecting = adapter.connect();
    client.emitConnect();
    await connecting;

    adapter.subscribe('sensor/a', vi.fn());
    expect(adapter.isSubscribed('sensor/a')).toBe(true);

    adapter.unsubscribe('sensor/a');

    expect(client.unsubscribed).toEqual(['sensor/a']);
    expect(adapter.isSubscribed('sensor/a')).toBe(false);
  });

  it('stops delivering to a callback after unsubscribe', async () => {
    const { adapter, client } = setup();
    const connecting = adapter.connect();
    client.emitConnect();
    await connecting;

    const received = vi.fn();
    adapter.subscribe('sensor/a', received);
    adapter.unsubscribe('sensor/a');

    client.emitMessage('sensor/a', encodePayload('after'));

    expect(received).not.toHaveBeenCalled();
  });

  it('ends the client on disconnect and reports network status', async () => {
    const { adapter, client } = setup();
    expect(adapter.networkStatus()).toBe(WebSocket.CLOSED);

    const connecting = adapter.connect();
    client.emitConnect();
    await connecting;
    expect(adapter.networkStatus()).toBe(WebSocket.OPEN);

    const onClose = vi.fn();
    adapter.onClose(onClose);
    adapter.disconnect();

    expect(client.endCalls).toBe(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(adapter.networkStatus()).toBe(WebSocket.CLOSED);
  });

  it('forwards client errors to onError', async () => {
    const { adapter, client } = setup();
    const onError = vi.fn();
    adapter.onError(onError);

    const connecting = adapter.connect();
    client.emitConnect();
    await connecting;

    const failure = new Error('broker refused');
    client.emitError(failure);

    expect(onError).toHaveBeenCalledWith(failure);
  });

  it('throws on send because MQTT needs a topic', () => {
    const { adapter } = setup();

    expect(() => adapter.send('payload')).toThrowError(
      'Method not implemented.',
    );
  });

  it('feeds every message into the WebSocketClient pipeline', async () => {
    const { adapter, client, injectedConnect } = setup();
    const wsClient = new WebSocketClient(adapter);
    const streamed: string[] = [];
    const subscription = wsClient.messages$.subscribe((message) => {
      streamed.push(message);
    });

    const connecting = wsClient.connect();

    // WebSocketClient.connect() 는 onBeforeConnect 훅을 await 한 뒤에야 어댑터의
    // connect() 를 호출한다. 어댑터가 리스너를 등록하기 전에 emit 하면 아무 일도
    // 일어나지 않으므로, 팩토리 호출을 확인한 다음 emit 한다.
    await vi.waitFor(() => {
      expect(injectedConnect).toHaveBeenCalledTimes(1);
    });
    client.emitConnect();
    await connecting;

    client.emitMessage('any/topic', encodePayload('through-pipeline'));

    await vi.waitFor(() => {
      expect(streamed).toEqual(['through-pipeline']);
    });

    subscription.unsubscribe();
  });
});

describe('injected mqtt module contract', () => {
  it('accepts the real mqtt@5.14.0 connect function', () => {
    // AC3: 컴파일 타임 검증이 핵심이다. tsconfig 의 include 가 테스트 파일을
    // 포함하므로 `npm run build` 가 이 대입을 실제로 검사한다.
    const injected: MqttConnect<Parameters<typeof connect>[1]> = connect;

    expect(typeof injected).toBe('function');
  });
});

describe('MqttWebSocketClientAdapter — 적대적 리뷰 반영 (review.md)', () => {
  it('rejects connect when the broker errors before connecting (AC10/B1)', async () => {
    const { adapter, client } = setup();
    const onError = vi.fn();
    adapter.onError(onError);

    const connecting = adapter.connect();
    client.emitError(new Error('broker unreachable'));

    await expect(connecting).rejects.toThrowError('broker unreachable');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('keeps the connection when an error arrives after connecting (AC10/B1)', async () => {
    const { adapter, client } = setup();
    const connecting = adapter.connect();
    client.emitConnect();
    await expect(connecting).resolves.toBeUndefined();

    const onError = vi.fn();
    adapter.onError(onError);
    client.emitError(new Error('later hiccup'));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(adapter.networkStatus()).toBe(WebSocket.OPEN);
  });

  it('registers its listeners only once across repeated connect calls (AC11/B2)', async () => {
    const { adapter, client, injectedConnect } = setup();

    const first = adapter.connect();
    const second = adapter.connect();
    client.emitConnect();
    await Promise.all([first, second]);

    expect(injectedConnect).toHaveBeenCalledTimes(1);
    expect(client.listenerCounts).toEqual({
      connect: 1,
      message: 1,
      error: 1,
      close: 1,
    });

    const received = vi.fn();
    adapter.subscribe('once/only', received);
    client.emitMessage('once/only', encodePayload('single'));

    expect(received).toHaveBeenCalledTimes(1);
  });

  it('passes the receiving topic to a wildcard callback (AC12/D1)', async () => {
    const { adapter, client } = setup();
    const connecting = adapter.connect();
    client.emitConnect();
    await connecting;

    const received = vi.fn();
    adapter.subscribe('sensor/+/temp', received);

    client.emitMessage('sensor/kitchen/temp', encodePayload('19'));
    client.emitMessage('sensor/attic/temp', encodePayload('7'));

    expect(received).toHaveBeenNthCalledWith(1, '19', 'sensor/kitchen/temp');
    expect(received).toHaveBeenNthCalledWith(2, '7', 'sensor/attic/temp');
  });

  it('keeps every callback when one filter is subscribed twice (AC13/D2)', async () => {
    const { adapter, client } = setup();
    const connecting = adapter.connect();
    client.emitConnect();
    await connecting;

    const first = vi.fn();
    const second = vi.fn();
    adapter.subscribe('sensor/a', first);
    adapter.subscribe('sensor/a', second);

    client.emitMessage('sensor/a', encodePayload('both'));

    expect(first).toHaveBeenCalledWith('both', 'sensor/a');
    expect(second).toHaveBeenCalledWith('both', 'sensor/a');
    // 브로커에는 한 번만 등록한다
    expect(client.subscribed).toEqual(['sensor/a']);
  });

  it('registers a subscription made before connecting (AC14/D3)', async () => {
    const { adapter, client } = setup();

    const received = vi.fn();
    adapter.subscribe('early/topic', received);
    expect(adapter.isSubscribed('early/topic')).toBe(true);
    expect(client.subscribed).toEqual([]);

    const connecting = adapter.connect();
    client.emitConnect();
    await connecting;

    expect(client.subscribed).toEqual(['early/topic']);

    client.emitMessage('early/topic', encodePayload('delivered'));
    expect(received).toHaveBeenCalledWith('delivered', 'early/topic');
  });

  it('reports a failed subscribe through onError (AC15/D4)', async () => {
    const { adapter, client } = setup();
    const connecting = adapter.connect();
    client.emitConnect();
    await connecting;

    const onError = vi.fn();
    adapter.onError(onError);
    client.failNextSubscribeWith = new Error('not authorized');

    adapter.subscribe('secret/topic', vi.fn());

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toContain('not authorized');
    expect(onError.mock.calls[0][0].message).toContain('secret/topic');
  });

  it('passes publish and subscribe options to the injected client (AC16/S1)', async () => {
    const { adapter, client } = setup();
    const connecting = adapter.connect();
    client.emitConnect();
    await connecting;

    adapter.subscribe('qos/topic', vi.fn(), { qos: 2 });
    adapter.publish('qos/topic', 'payload', { qos: 1, retain: true });

    expect(client.subscribeCalls).toEqual([
      { topic: 'qos/topic', options: { qos: 2 } },
    ]);
    expect(client.published).toEqual([
      {
        topic: 'qos/topic',
        message: 'payload',
        options: { qos: 1, retain: true },
      },
    ]);
  });

  it('refuses a shared subscription loudly instead of silently (AC17/S2)', async () => {
    const { adapter, client } = setup();
    const connecting = adapter.connect();
    client.emitConnect();
    await connecting;

    const onError = vi.fn();
    adapter.onError(onError);

    adapter.subscribe('$share/group/sensor/+', vi.fn());

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toContain(
      'Shared subscription is not supported',
    );
    expect(adapter.isSubscribed('$share/group/sensor/+')).toBe(false);
    expect(client.subscribed).toEqual([]);
  });
});

function setupClient(plugins?: IWebSocketPlugin[]) {
  const injected = new FakeClient();
  const client = new MqttWebSocketClient({
    brokerURL: 'wss://broker.test:8884/mqtt',
    connect: () => injected,
    plugins,
  });

  return { client, injected };
}

async function connectBoth(
  client: MqttWebSocketClient,
  injected: FakeClient,
) {
  const connecting = client.connect();
  // WebSocketClient.connect() 는 onBeforeConnect 훅을 await 한 뒤 어댑터의
  // connect() 를 부른다. 리스너가 등록된 뒤에 emit 해야 한다.
  await vi.waitFor(() => {
    expect(injected.listenerCounts.connect).toBe(1);
  });
  injected.emitConnect();
  await connecting;
}

describe('MqttWebSocketClient', () => {
  it('runs plugin connect hooks around the adapter connect', async () => {
    const timeline: string[] = [];
    const plugin: IWebSocketPlugin = {
      name: 'timeline',
      onBeforeConnect: () => {
        timeline.push('before');
      },
      onAfterConnect: () => {
        timeline.push('after');
      },
    };
    const { client, injected } = setupClient([plugin]);

    const connecting = client.connect();
    await vi.waitFor(() => {
      expect(injected.listenerCounts.connect).toBe(1);
    });

    // 어댑터 connect() 가 불린 시점에 onBeforeConnect 는 이미 끝나 있고
    // onAfterConnect 는 아직 실행되지 않았다.
    expect(timeline).toEqual(['before']);

    injected.emitConnect();
    await connecting;

    expect(timeline).toEqual(['before', 'after']);
  });

  it('delegates subscribe and publish to its adapter', async () => {
    const { client, injected } = setupClient();
    await connectBoth(client, injected);

    const received = vi.fn();
    client.subscribe('sensor/+/temp', received);
    client.publish('sensor/a/temp', '21.5');

    expect(injected.subscribed).toEqual(['sensor/+/temp']);
    expect(injected.published).toEqual([
      { topic: 'sensor/a/temp', message: '21.5' },
    ]);
    expect(client.isSubscribed('sensor/+/temp')).toBe(true);

    injected.emitMessage('sensor/a/temp', encodePayload('21.5'));
    expect(received).toHaveBeenCalledWith('21.5', 'sensor/a/temp');
  });

  it('unsubscribes through the adapter', async () => {
    const { client, injected } = setupClient();
    await connectBoth(client, injected);

    client.subscribe('sensor/a', vi.fn());
    client.unsubscribe('sensor/a');

    expect(injected.unsubscribed).toEqual(['sensor/a']);
    expect(client.isSubscribed('sensor/a')).toBe(false);
  });

  it('reports status and closes through the base client', async () => {
    const { client, injected } = setupClient();
    expect(client.status()).toBe(WebSocket.CLOSED);

    await connectBoth(client, injected);
    expect(client.status()).toBe(WebSocket.OPEN);

    client.disconnect();

    await vi.waitFor(() => {
      expect(injected.endCalls).toBe(1);
    });
    expect(client.status()).toBe(WebSocket.CLOSED);
  });
});
