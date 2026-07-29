/**
 * Ticket #25: the daily loop (Open → Converse → Debrief → Tomorrow →
 * Open) threads `sessionId`/`learnerId` through several hops, each
 * screen forwarding only whichever ids it actually has — and each hop
 * had independently re-derived "build a params object only if a real id
 * exists, otherwise navigate to the bare path" (found as repeated in
 * this ticket's own code review). One shared shape, not five.
 */
/** `pathname` is narrowed to the loop's own three downstream destinations, not a generic string — expo-router's typed routes reject anything wider. */
export function realParamsOrBarePath(pathname: '/debrief' | '/tomorrow' | '/open', ids: { sessionId?: string; learnerId?: string }) {
  const params = Object.fromEntries(Object.entries(ids).filter((entry): entry is [string, string] => entry[1] !== undefined));
  return Object.keys(params).length > 0 ? { pathname, params } : pathname;
}
