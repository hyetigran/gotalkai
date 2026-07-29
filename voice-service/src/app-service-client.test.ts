import type { FetchImpl } from './app-service-client';
import { createAppServiceClient } from './app-service-client';

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('createAppServiceClient', () => {
  describe('recordTurn', () => {
    it('POSTs to /sessions/:id/turns and returns the real id on success', async () => {
      const calls: [string, RequestInit | undefined][] = [];
      const fetchImpl: FetchImpl = (async (url: string, init?: RequestInit) => {
        calls.push([url, init]);
        return fakeResponse(201, { status: 'ok', id: 'turn-real-id' });
      }) as FetchImpl;
      const client = createAppServiceClient('http://app-service.test', fetchImpl);

      const id = await client.recordTurn('session-1', { speaker: 'persona', content: 'Ах, конечно.' });

      expect(id).toBe('turn-real-id');
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe('http://app-service.test/sessions/session-1/turns');
      const init = calls[0]?.[1];
      expect(init?.method).toBe('POST');
      expect(JSON.parse(init?.body as string)).toEqual({ speaker: 'persona', content: 'Ах, конечно.' });
    });

    it('resolves null (never throws) on a non-2xx response', async () => {
      const fetchImpl: FetchImpl = (async () => fakeResponse(503, { status: 'error' })) as FetchImpl;
      const client = createAppServiceClient('http://app-service.test', fetchImpl);

      await expect(client.recordTurn('session-1', { speaker: 'learner', content: 'Привет' })).resolves.toBeNull();
    });

    it('resolves null (never throws) on a network error', async () => {
      const fetchImpl: FetchImpl = (async () => {
        throw new Error('network unreachable');
      }) as FetchImpl;
      const client = createAppServiceClient('http://app-service.test', fetchImpl);

      await expect(client.recordTurn('session-1', { speaker: 'learner', content: 'Привет' })).resolves.toBeNull();
    });

    it('resolves null on a malformed response body (no string id)', async () => {
      const fetchImpl: FetchImpl = (async () => fakeResponse(201, { status: 'ok' })) as FetchImpl;
      const client = createAppServiceClient('http://app-service.test', fetchImpl);

      await expect(client.recordTurn('session-1', { speaker: 'learner', content: 'Привет' })).resolves.toBeNull();
    });
  });

  describe('recordInterruption', () => {
    it('POSTs to /turns/:id/interruption with the elapsed ms', async () => {
      const calls: [string, RequestInit | undefined][] = [];
      const fetchImpl: FetchImpl = (async (url: string, init?: RequestInit) => {
        calls.push([url, init]);
        return fakeResponse(200, { status: 'ok' });
      }) as FetchImpl;
      const client = createAppServiceClient('http://app-service.test', fetchImpl);

      await client.recordInterruption('turn-1', 320);

      expect(calls[0]?.[0]).toBe('http://app-service.test/turns/turn-1/interruption');
      expect(JSON.parse(calls[0]?.[1]?.body as string)).toEqual({ interruptedAfterMs: 320 });
    });

    it('never throws on a network error', async () => {
      const fetchImpl: FetchImpl = (async () => {
        throw new Error('network unreachable');
      }) as FetchImpl;
      const client = createAppServiceClient('http://app-service.test', fetchImpl);

      await expect(client.recordInterruption('turn-1', 320)).resolves.toBeUndefined();
    });
  });
});
