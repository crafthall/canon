// End-to-end test of the pricing-reversal worked example (examples/pricing-reversal/steps.md): the replay
// script builds a throwaway git repository with a "before" and an "after" commit and runs the real `canon` CLI on each.
// It must exit 0, which means `canon check` found exactly the `topic` problem before and nothing (0 problems, 0 findings)
// after. The script runs as a separate Node process, the way a reader would run it.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPLAY = join(import.meta.dirname, '../examples/pricing-reversal/replay.mjs');

describe('worked example: pricing reversal replay', () => {
  it('finds the stale passage before the fix and nothing after it', () => {
    const r = spawnSync(process.execPath, [REPLAY], { encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).not.toMatch(/FAIL/);
    expect(r.stdout).toMatch(/^ {2}ok {3}the one problem is rule "topic": .*topic "free and paid plans"/m);
    expect(r.stdout).toMatch(/^ {2}ok {3}exactly 3 files change:/m);
    expect(r.stdout).toMatch(/^ {2}ok {3}counts: 0 problem\(s\), 0 finding\(s\) \(want 0, 0\)$/m);
    expect(r.stdout.trimEnd().split('\n').at(-1)).toBe('replay: PASS – before: 1 topic problem; after: 0 problems, 0 findings.');
  });
});
