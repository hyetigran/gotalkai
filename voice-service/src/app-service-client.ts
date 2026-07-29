import type { RecordedTurnInput } from './turn-orchestrator';

/**
 * Ticket #29 / docs/adr/0022: the real HTTP implementation of
 * `TurnOrchestratorDeps.recordTurn`/`recordInterruption` — posts to
 * app-service's `POST /sessions/:id/turns` and `POST
 * /turns/:id/interruption` (app-service/src/server.ts). Never throws:
 * `recordTurn` resolves `null` and `recordInterruption` resolves on any
 * failure (network error, non-2xx, malformed response) — a recording
 * failure must never affect the live pipeline (ARCHITECTURE.md: "Voice
 * has zero DB mid-turn"). `turn-orchestrator.ts` still wraps every call
 * in its own `.catch` as a second layer of the same guarantee; this
 * module's job is just to talk HTTP, not to also own that contract.
 *
 * Injectable `fetchImpl` (defaulting to the global `fetch`), same DI
 * seam `app-service/src/observability/alerting.ts` already uses.
 */

export type FetchImpl = typeof fetch;

export function createAppServiceClient(baseUrl: string, fetchImpl: FetchImpl = fetch) {
  async function recordTurn(sessionId: string, turn: RecordedTurnInput): Promise<string | null> {
    try {
      const response = await fetchImpl(`${baseUrl}/sessions/${sessionId}/turns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(turn),
      });
      if (!response.ok)
        return null;
      const body = (await response.json()) as { id?: unknown };
      return typeof body.id === 'string' ? body.id : null;
    }
    catch {
      return null;
    }
  }

  async function recordInterruption(turnId: string, interruptedAfterMs: number): Promise<void> {
    try {
      await fetchImpl(`${baseUrl}/turns/${turnId}/interruption`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ interruptedAfterMs }),
      });
    }
    catch {
      // Swallowed deliberately — see this module's own doc comment.
    }
  }

  return { recordTurn, recordInterruption };
}
