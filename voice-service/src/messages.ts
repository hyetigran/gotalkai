import { z } from 'zod';

/**
 * Client/server message schemas — the second of Zod's three boundaries
 * (PRD §7.8). This skeleton only needs the round-trip ping; the real
 * pipeline's audio/control messages are later ticket work. Ticket #26
 * ("runtime validation hardening") confirmed the boundary itself is
 * already sound for what exists today: server.ts rejects malformed JSON
 * and well-formed-but-unrecognized messages with a distinct error each
 * (see server.test.ts), never crashing or silently dropping input — the
 * hardening this ticket asks for is already in place, not added by it.
 */
export const clientMessageSchema = z.object({
  type: z.literal('ping'),
  /** Echoed back verbatim so the client can match responses to requests. */
  requestId: z.string().optional(),
});

export type ClientMessage = z.infer<typeof clientMessageSchema>;

/**
 * No Zod schema for outbound messages, deliberately — Zod belongs at
 * untrusted boundaries (PRD §7.8), and the server's own output isn't one
 * from its own perspective. `send()` in server.ts is the single
 * construction site, so there's nowhere for a hand-written literal to
 * drift from this type.
 */
export type ServerMessage
  = | { type: 'pong'; requestId: string | undefined; serverTime: number }
    | { type: 'error'; message: string };
