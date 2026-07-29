import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertGoldenSetIsAppendOnly, isAppendOnlyDiff } from './append-only';

describe('isAppendOnlyDiff', () => {
  it('accepts a diff that only adds lines', () => {
    const diff = [
      'diff --git a/golden-set.ts b/golden-set.ts',
      '--- a/golden-set.ts',
      '+++ b/golden-set.ts',
      '@@ -20,0 +21,3 @@',
      '+  {',
      '+    id: \'golden-023\',',
      '+  },',
    ].join('\n');
    expect(isAppendOnlyDiff(diff)).toBe(true);
  });

  it('accepts an empty diff (no changes to the file at all)', () => {
    expect(isAppendOnlyDiff('')).toBe(true);
  });

  it('rejects a diff that removes an existing line, even if it also adds one (an edit)', () => {
    const diff = [
      'diff --git a/golden-set.ts b/golden-set.ts',
      '--- a/golden-set.ts',
      '+++ b/golden-set.ts',
      '@@ -5,1 +5,1 @@',
      '-    learnerTurn: \'original text\',',
      '+    learnerTurn: \'edited text\',',
    ].join('\n');
    expect(isAppendOnlyDiff(diff)).toBe(false);
  });

  it('rejects a diff that removes an existing entry outright, with no replacement', () => {
    const diff = [
      'diff --git a/golden-set.ts b/golden-set.ts',
      '--- a/golden-set.ts',
      '+++ b/golden-set.ts',
      '@@ -10,3 +10,0 @@',
      '-  {',
      '-    id: \'golden-005\',',
      '-  },',
    ].join('\n');
    expect(isAppendOnlyDiff(diff)).toBe(false);
  });

  it('does not treat the `---`/`+++` file-header lines themselves as removed content', () => {
    const diff = ['--- a/golden-set.ts', '+++ b/golden-set.ts'].join('\n');
    expect(isAppendOnlyDiff(diff)).toBe(true);
  });
});

/**
 * `assertGoldenSetIsAppendOnly` shells out to a real `git diff` — tested
 * here against a real, disposable git repo (not a mock of `git`) so the
 * test proves the actual CLI invocation and diff format are handled
 * correctly, not just the pure `isAppendOnlyDiff` logic above.
 */
describe('assertGoldenSetIsAppendOnly', () => {
  let repoDir: string;

  function git(...args: string[]): void {
    execFileSync('git', args, { cwd: repoDir });
  }

  beforeEach(() => {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'append-only-test-'));
    // `-b main` forces a consistent branch name regardless of the
    // environment's `init.defaultBranch` config (main vs. master).
    git('init', '--quiet', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    fs.writeFileSync(path.join(repoDir, 'golden-set.ts'), 'export const GOLDEN_SET = [\n  { id: \'golden-001\' },\n];\n');
    git('add', 'golden-set.ts');
    git('commit', '--quiet', '-m', 'initial');
  });

  afterEach(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
  });

  it('does not throw when a new entry is purely appended', () => {
    fs.writeFileSync(
      path.join(repoDir, 'golden-set.ts'),
      'export const GOLDEN_SET = [\n  { id: \'golden-001\' },\n  { id: \'golden-002\' },\n];\n',
    );
    git('checkout', '--quiet', '-b', 'feature');
    git('add', 'golden-set.ts');
    git('commit', '--quiet', '-m', 'append entry');

    expect(() => assertGoldenSetIsAppendOnly('main', 'golden-set.ts', repoDir)).not.toThrow();
  });

  it('throws when an existing entry is edited', () => {
    fs.writeFileSync(
      path.join(repoDir, 'golden-set.ts'),
      'export const GOLDEN_SET = [\n  { id: \'golden-001-edited\' },\n];\n',
    );
    git('checkout', '--quiet', '-b', 'feature');
    git('add', 'golden-set.ts');
    git('commit', '--quiet', '-m', 'edit entry');

    expect(() => assertGoldenSetIsAppendOnly('main', 'golden-set.ts', repoDir)).toThrow(/append-only/);
  });
});
