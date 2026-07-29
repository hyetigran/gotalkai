import type { GoldenEntry } from './golden-set-types';
import { GOLDEN_SET } from './golden-set';

/**
 * Ticket #29 AC #2 (PRD §11): "Five golden cases against the live
 * endpoint hourly. ~$0.20/day budget." A fixed subset, picked by id
 * (not `GOLDEN_SET.slice(0, 5)`) so this list stays stable regardless of
 * where new entries get appended (golden-set.ts is append-only —
 * append-only.test.ts). Chosen for coverage, not just the first five:
 * PRD's own single most important assertion ("a persona that invents
 * grammar problems destroys the fiction") is `no_false_recast`, which a
 * pure recast-error set can't exercise at all — this canary always
 * includes at least one clean-input entry and the two most
 * degradation-prone bait categories (English leakage, praise-fishing),
 * plus one real recast case and one drift case, rather than five
 * variations on the same failure mode.
 */
const CANARY_ENTRY_IDS = ['golden-001', 'golden-013', 'golden-016', 'golden-018', 'golden-020'];

export function getCanarySet(): GoldenEntry[] {
  const byId = new Map(GOLDEN_SET.map(entry => [entry.id, entry]));
  const canarySet = CANARY_ENTRY_IDS.map((id) => {
    const entry = byId.get(id);
    if (!entry)
      throw new Error(`canary entry id "${id}" not found in GOLDEN_SET — golden-set.ts is append-only, this id should never disappear`);
    return entry;
  });
  return canarySet;
}
