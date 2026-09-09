import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';

import {
  type IWebSocketPlugin,
  WindowWebSocketClient,
} from './WebSocketClient';

// 인프로세스 에코 서버. 테스트 더블이 아니라 실제 WebSocket 서버다.
// `server/src/server.ts` 의 데모 서버와 같은 규약을 쓴다: 연결 직후 인사
// 메시지 하나, 이후 받은 메시지마다 `서버 응답: ` 접두사를 붙여 에코한다.
function startEchoServer() {
  const server = new WebSocketServer({ port: 0 });
  let connectionCount = 0;

  server.on('connection', (socket) => {
    connectionCount += 1;
    socket.on('message', (data) => {
      socket.send(`서버 응답: ${data.toString()}`);
    });
    socket.send('서버에 연결되었습니다!');
  });

  const ready = new Promise<void>((resolve) => {
    server.on('listening', () => resolve());
  });

  return {
    ready,
    // 누적 연결 수. 재연결이 실제로 새 소켓을 열었는지 본다.
    get connectionCount() {
      return connectionCount;
    },
    // 지금 열려 있는 소켓 수.
    get openConnections() {
      return server.clients.size;
    },
    // 리스닝은 유지하고 클라이언트 소켓만 끊는다.
    dropConnections() {
      for (const socket of server.clients) {
        socket.terminate();
      }
    },
    get url() {
      const address = server.address();
      if (typeof address === 'string' || address === null) {
        throw new Error('echo server has no port');
      }
      return `ws://127.0.0.1:${address.port}`;
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

function nextValue<T>(
  register: (callback: (value: T) => void) => unknown,
): Promise<T> {
  return new Promise<T>((resolve) => {
    register((value) => resolve(value));
  });
}

describe('WindowWebSocketClient against a real WebSocket server', () => {
  let echoServer: ReturnType<typeof startEchoServer>;

  beforeEach(async () => {
    echoServer = startEchoServer();
    await echoServer.ready;
  });

  afterEach(async () => {
    await echoServer.close();
  });

  it('connects, reports OPEN status and fires onConnect', async () => {
    const client = new WindowWebSocketClient({ url: echoServer.url });
    const connected = nextValue<void>((callback) => client.onConnect(callback));

    await client.connect();
    await connected;

    expect(client.status()).toBe(WebSocket.OPEN);
    client.disconnect();
  });

  it('receives the server greeting through listeners and messages$', async () => {
    const client = new WindowWebSocketClient({ url: echoServer.url });
    const fromListener = nextValue<string>((callback) =>
      client.onMessage(callback),
    );
    const fromStream = new Promise<string>((resolve) => {
      client.messages$.subscribe((message) => resolve(message));
    });

    await client.connect();

    expect(await fromListener).toBe('서버에 연결되었습니다!');
    expect(await fromStream).toBe('서버에 연결되었습니다!');
    client.disconnect();
  });

  it('echoes what it sends', async () => {
    const client = new WindowWebSocketClient({ url: echoServer.url });

    await client.connect();
    const echoed = new Promise<string>((resolve) => {
      client.onMessage((message) => {
        if (message.includes('여보세요')) {
          resolve(message);
        }
      });
    });
    client.send('여보세요');

    expect(await echoed).toBe('서버 응답: 여보세요');
    client.disconnect();
  });

  it('runs plugin hooks in the documented order and sends the transformed payload', async () => {
    const calls: string[] = [];
    const plugin: IWebSocketPlugin = {
      name: 'RecordingPlugin',
      onBeforeConnect: () => {
        calls.push('onBeforeConnect');
      },
      onAfterConnect: () => {
        calls.push('onAfterConnect');
      },
      onBeforeSend: (data) => {
        calls.push('onBeforeSend');
        return `${data}!`;
      },
      onAfterSend: () => {
        calls.push('onAfterSend');
      },
      onMessage: () => {
        calls.push('onMessage');
      },
      onBeforeDisconnect: () => {
        calls.push('onBeforeDisconnect');
      },
      onAfterDisconnect: () => {
        calls.push('onAfterDisconnect');
      },
    };

    const client = new WindowWebSocketClient({
      url: echoServer.url,
      plugins: [plugin],
    });

    await client.connect();
    const echoed = new Promise<string>((resolve) => {
      client.onMessage((message) => {
        if (message.includes('보냄')) {
          resolve(message);
        }
      });
    });
    await client.sendAsync('보냄');

    expect(await echoed).toBe('서버 응답: 보냄!');

    await client.disconnectAsync();

    expect(calls.slice(0, 2)).toEqual(['onBeforeConnect', 'onAfterConnect']);
    expect(calls).toContain('onMessage');
    expect(calls.indexOf('onBeforeSend')).toBeLessThan(
      calls.indexOf('onAfterSend'),
    );
    expect(calls.slice(-2)).toEqual([
      'onBeforeDisconnect',
      'onAfterDisconnect',
    ]);
  });

  it('opens one connection when connect() is called twice', async () => {
    const client = new WindowWebSocketClient({ url: echoServer.url });

    await Promise.all([client.connect(), client.connect()]);
    await client.connect();

    expect(echoServer.connectionCount).toBe(1);
    client.disconnect();
  });

  it('delivers an inbound message once after repeated connect() calls', async () => {
    const client = new WindowWebSocketClient({ url: echoServer.url });
    const messages: string[] = [];
    client.onMessage((message) => messages.push(message));

    await client.connect();
    await client.connect();
    client.send('한 번만');
    await waitFor(() => messages.some((m) => m.includes('한 번만')));

    expect(messages.filter((m) => m.includes('한 번만'))).toHaveLength(1);
    // 메시지가 한 번만 오는 것으로는 유령 소켓이 없다는 증거가 안 된다.
    expect(echoServer.connectionCount).toBe(1);
    expect(echoServer.openConnections).toBe(1);
    client.disconnect();
  });

  it('reconnects after the server drops the connection', async () => {
    const client = new WindowWebSocketClient({ url: echoServer.url });
    const closed = nextValue<void>((callback) => client.onClose(callback));

    await client.connect();
    echoServer.dropConnections();
    await closed;
    await client.connect();

    expect(echoServer.connectionCount).toBe(2);
    expect(client.status()).toBe(WebSocket.OPEN);
    client.disconnect();
  });

  it('fires onClose and reports CLOSED status after disconnect', async () => {
    const client = new WindowWebSocketClient({ url: echoServer.url });
    const closed = nextValue<void>((callback) => client.onClose(callback));

    await client.connect();
    client.disconnect();
    await closed;

    expect(client.status()).toBe(WebSocket.CLOSED);
  });

  it('fires onClose when the server drops the connection', async () => {
    const client = new WindowWebSocketClient({ url: echoServer.url });
    const closed = nextValue<void>((callback) => client.onClose(callback));

    await client.connect();
    await echoServer.close();

    await closed;
    expect(client.status()).toBe(WebSocket.CLOSED);
  });

  it('allows another attempt after a failed connection', async () => {
    const unusedUrl = echoServer.url;
    await echoServer.close();

    const client = new WindowWebSocketClient({ url: unusedUrl });
    const errors: Error[] = [];
    client.onError((error) => errors.push(error));

    // 실패한 소켓은 error 뒤에 close 를 받는다(측정: error → close:1006). 그
    // close 에서 약속이 비워지지 않으면 두 번째 시도가 아예 일어나지 않는다.
    void client.connect();
    await waitFor(() => errors.length === 1);
    void client.connect();
    await waitFor(() => errors.length === 2);

    expect(errors).toHaveLength(2);
  });

  it('fires onError when the port refuses the connection', async () => {
    const unusedUrl = echoServer.url;
    await echoServer.close();

    const client = new WindowWebSocketClient({ url: unusedUrl });
    const error = nextValue<Error>((callback) => client.onError(callback));

    void client.connect();

    expect(await error).toBeDefined();
  });
});
