import type { FetchImpl } from './alerting';
import { sendHealthAlert } from './alerting';

describe('sendHealthAlert', () => {
  it('posts to the webhook, tagged severity: page', async () => {
    const calls: Parameters<FetchImpl>[] = [];
    const fetchImpl: FetchImpl = async (url, init) => {
      calls.push([url, init]);
      return {} as Response;
    };

    await sendHealthAlert('https://example.test/webhook', { source: 'canary_failure', message: 'golden-001 gate failed' }, fetchImpl);

    expect(calls).toHaveLength(1);
    const body = JSON.parse((calls[0]?.[1] as { body: string }).body);
    expect(body).toMatchObject({ severity: 'page', source: 'canary_failure', message: 'golden-001 gate failed' });
  });

  it('no-ops (no fetch call) when no webhook URL is configured — logs, does not throw', async () => {
    const fetchImpl = jest.fn();
    await expect(sendHealthAlert(undefined, { source: 'canary_failure', message: 'x' }, fetchImpl)).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
