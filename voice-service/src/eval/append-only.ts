import { execFileSync } from 'node:child_process';

/**
 * Ticket #28 AC #1: golden-set.ts is "append only, never edit... tooling/
 * process prevents editing existing entries, not just a convention." A
 * hash checked into the same file someone is editing is trivially
 * bypassed by updating both together — this instead inspects the actual
 * git diff, which is what "append only" structurally means: every hunk in
 * the diff may only ADD lines, never remove or change one.
 *
 * Pure: true iff `diffText` (unified diff format, as `git diff` produces)
 * contains no removed/changed lines. A line starting with a single `-`
 * (not the `---` file-header marker) is a removal — under a unified diff,
 * an "edit" is always a removal of the old line plus an addition of the
 * new one, so this single check catches both edits and deletions.
 */
export function isAppendOnlyDiff(diffText: string): boolean {
  return diffText
    .split('\n')
    .every(line => !line.startsWith('-') || line.startsWith('---'));
}

/**
 * Ticket #28 UAT #3: "Attempt to edit an existing golden-set entry;
 * confirm the append-only constraint actually blocks it." Wired into CI
 * (.gitlab-ci.yml) as its own job step, run against the merge-base of the
 * MR — a real edit to an existing entry fails the pipeline, not just a
 * local convention.
 *
 * Throws (rather than returning a boolean) so a CI job step can invoke
 * this as a script and rely on the nonzero exit code — see the
 * `require.main === module` block below.
 */
export function assertGoldenSetIsAppendOnly(baseRef: string, goldenSetPath: string, cwd: string = process.cwd()): void {
  const diff = execFileSync('git', ['diff', `${baseRef}...HEAD`, '--', goldenSetPath], { encoding: 'utf8', cwd });
  if (!isAppendOnlyDiff(diff)) {
    throw new Error(
      `${goldenSetPath} is append-only — this diff removes or changes an existing line. `
      + 'Golden-set entries must never be edited once frozen (PRD §10); add a new entry instead.',
    );
  }
}

// Run directly (`tsx src/eval/append-only.ts <baseRef>`) as a CI check —
// see .gitlab-ci.yml's `eval:golden-set-append-only` job.
if (require.main === module) {
  const baseRef = process.argv[2] ?? 'origin/main';
  try {
    assertGoldenSetIsAppendOnly(baseRef, 'src/eval/golden-set.ts');
    console.log('OK: golden-set.ts changes are pure additions (or no changes).');
  }
  catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
