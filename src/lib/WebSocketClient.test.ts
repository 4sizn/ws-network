import { describe, expect, it, vi } from 'vitest';

import {
  type IWebSocketPlugin,
  WebSocketClient,
  WebSocketClientAdapter,
} from './WebSocketClient';

class FakeAdapter extends WebSocketClientAdapter<unknown> {
  #connected = false;
  #messageCallback: (data: string) => void = () => {};
  #errorCallback: (error: Error) => void = () => {};
  #closeCallback: () => void = () => {};
  #connectCallback: () => void = () => {};

  public readonly sentPayloads: string[] = [];

  async connect(): Promise<void> {
    this.#connected = true;
    this.#connectCallback();
  }

  disconnect(): void {
    this.#connected = false;
    this.#closeCallback();
  }

  send(data: string): void {
    this.sentPayloads.push(data);
  }

  onMessage(callback: (data: string) => void): void {
    this.#messageCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.#errorCallback = callback;
  }

  onClose(callback: () => void): void {
    this.#closeCallback = callback;
  }

  onConnect(callback: () => void): void {
    this.#connectCallback = callback;
  }

  networkStatus(): number {
    return this.#connected ? 1 : 3;
  }

  emitMessage(data: string): void {
    this.#messageCallback(data);
  }

  emitError(error: Error): void {
    this.#errorCallback(error);
  }

  emitClose(): void {
    this.#closeCallback();
  }

  emitConnect(): void {
    this.#connectCallback();
  }
}

describe('WebSocketClient', () => {
  it('fires multiple message listeners and unsubscribes one idempotently', async () => {
    const adapter = new FakeAdapter();
    const client = new WebSocketClient(adapter);
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    const unsubscribeA = client.onMessage(listenerA);
    client.onMessage(listenerB);

    adapter.emitMessage('first');

    await vi.waitFor(() => {
      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerB).toHaveBeenCalledTimes(1);
    });

    unsubscribeA();
    adapter.emitMessage('second');

    await vi.waitFor(() => {
      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerB).toHaveBeenCalledTimes(2);
    });

    unsubscribeA();
    adapter.emitMessage('third');

    await vi.waitFor(() => {
      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerB).toHaveBeenCalledTimes(3);
    });
  });

  it('auto-unsubscribes message listener with AbortSignal', async () => {
    const adapter = new FakeAdapter();
    const client = new WebSocketClient(adapter);
    const listener = vi.fn();
    const controller = new AbortController();

    const unsubscribe = client.onMessage(listener, { signal: controller.signal });
    adapter.emitMessage('before-abort');

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1);
    });

    controller.abort();
    adapter.emitMessage('after-abort');

    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    unsubscribe();
  });

  it('does not register message listener when AbortSignal is already aborted', async () => {
    const adapter = new FakeAdapter();
    const client = new WebSocketClient(adapter);
    const listener = vi.fn();
    const controller = new AbortController();

    controller.abort();
    const unsubscribe = client.onMessage(listener, { signal: controller.signal });

    adapter.emitMessage('ignored');
    await Promise.resolve();
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('runs plugin onMessage before listeners and messages$ emissions', async () => {
    const adapter = new FakeAdapter();
    const timeline: string[] = [];
    const plugin: IWebSocketPlugin = {
      name: 'timeline',
      onMessage: () => {
        timeline.push('plugin');
      },
    };
    const client = new WebSocketClient(adapter, { plugins: [plugin] });

    client.onMessage(() => {
      timeline.push('listener');
    });
    const subscription = client.messages$.subscribe(() => {
      timeline.push('stream');
    });

    adapter.emitMessage('ordered');

    await vi.waitFor(() => {
      expect(timeline).toEqual(['plugin', 'listener', 'stream']);
    });

    subscription.unsubscribe();
  });

  it('applies onBeforeSend transform chain in sendAsync', async () => {
    const adapter = new FakeAdapter();
    const pluginA: IWebSocketPlugin = {
      name: 'first',
      onBeforeSend: (data) => `${data}-a`,
    };
    const pluginB: IWebSocketPlugin = {
      name: 'second',
      onBeforeSend: (data) => `${data}-b`,
    };
    const client = new WebSocketClient(adapter, {
      plugins: [pluginA, pluginB],
    });

    await client.sendAsync('payload');

    expect(adapter.sentPayloads).toEqual(['payload-a-b']);
  });

  it('emits connected$, closed$, and errors$ from adapter callbacks', async () => {
    const adapter = new FakeAdapter();
    const client = new WebSocketClient(adapter);
    let connectedCount = 0;
    let closedCount = 0;
    const receivedErrors: Error[] = [];

    const connectedSub = client.connected$.subscribe(() => {
      connectedCount += 1;
    });
    const closedSub = client.closed$.subscribe(() => {
      closedCount += 1;
    });
    const errorsSub = client.errors$.subscribe((error) => {
      receivedErrors.push(error);
    });

    const error = new Error('boom');
    adapter.emitConnect();
    adapter.emitError(error);
    adapter.emitClose();

    await vi.waitFor(() => {
      expect(connectedCount).toBe(1);
      expect(closedCount).toBe(1);
      expect(receivedErrors).toEqual([error]);
    });

    connectedSub.unsubscribe();
    closedSub.unsubscribe();
    errorsSub.unsubscribe();
  });
});
