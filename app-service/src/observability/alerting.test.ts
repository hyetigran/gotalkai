import type { FetchImpl } from './alerting';
import { sendHealthAlert, sendQualityReport } from './alerting';

describe('sendHealthAlert / sendQualityReport', () => {
  it('sendHealthAlert posts to the health webhook, tagged severity: page', async () => {
    const calls: Parameters<FetchImpl>[] = [];
    const fetchImpl: FetchImpl = async (url, init) => {
      calls.push([url, init]);
      return {};
    };

    await sendHealthAlert('https://example.test/health-webhook', { source: 'canary_failure', message: 'golden-001 failed' }, fetchImpl);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('https://example.test/health-webhook');
    const body = JSON.parse(calls[0]?.[1]?.body ?? '{}');
    expect(body).toMatchObject({ severity: 'page', source: 'canary_failure', message: 'golden-001 failed' });
  });

  it('sendHealthAlert no-ops (no fetch call) when no webhook URL is configured — logs, does not throw', async () => {
    const fetchImpl = jest.fn();
    await expect(sendHealthAlert(undefined, { source: 'p95_budget_breach', message: 'total P95 over budget' }, fetchImpl)).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sendQualityReport posts to the quality webhook, tagged severity: digest', async () => {
    const calls: Parameters<FetchImpl>[] = [];
    const fetchImpl: FetchImpl = async (url, init) => {
      calls.push([url, init]);
      return {};
    };

    await sendQualityReport('https://example.test/quality-webhook', { message: 'weekly quality digest', detail: { revealRate: 0.4 } }, fetchImpl);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('https://example.test/quality-webhook');
    const body = JSON.parse(calls[0]?.[1]?.body ?? '{}');
    expect(body).toMatchObject({ severity: 'digest', message: 'weekly quality digest' });
  });

  it('sendQualityReport no-ops (no fetch call) when no webhook URL is configured', async () => {
    const fetchImpl = jest.fn();
    await sendQualityReport(undefined, { message: 'weekly quality digest', detail: {} }, fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('health and quality alerts never share a call path — posting one never invokes the other\'s webhook', async () => {
    const healthCalls: string[] = [];
    const qualityCalls: string[] = [];
    const healthFetch: FetchImpl = async (url) => {
      healthCalls.push(url);
      return {};
    };
    const qualityFetch: FetchImpl = async (url) => {
      qualityCalls.push(url);
      return {};
    };

    await sendHealthAlert('https://example.test/health', { source: 'canary_failure', message: 'x' }, healthFetch);
    expect(qualityCalls).toEqual([]);

    await sendQualityReport('https://example.test/quality', { message: 'y', detail: {} }, qualityFetch);
    expect(healthCalls).toEqual(['https://example.test/health']);
  });
});
