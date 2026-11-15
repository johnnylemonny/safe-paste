import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareFindings, resolveOverlaps } from '../../src/core/overlap.ts';
import type { Finding } from '../../src/core/types.ts';

describe('Core Overlap Module', () => {
  const createFinding = (
    id: string,
    start: number,
    end: number,
    category = 'github_pat_classic'
  ): Finding => ({
    id,
    category,
    range: { start, end },
    mask: 'ghp_••••••••',
    replacementText: '[REDACTED]',
  });

  it('correctly orders findings by start ascending, then length descending', () => {
    const f1 = createFinding('c_short', 10, 20);
    const f2 = createFinding('b_long', 10, 30);
    const f3 = createFinding('a_early', 0, 5);

    const findings = [f1, f2, f3];
    const sorted = [...findings].sort(compareFindings);

    assert.equal(sorted[0].id, 'a_early');
    assert.equal(sorted[1].id, 'b_long'); // Longer takes precedence at index 10
    assert.equal(sorted[2].id, 'c_short');
  });

  it('uses deterministic ID tie-breaking on identical ranges', () => {
    const f1 = createFinding('finding_z', 5, 15);
    const f2 = createFinding('finding_a', 5, 15);

    const sorted = [f1, f2].sort(compareFindings);
    assert.equal(sorted[0].id, 'finding_a');
    assert.equal(sorted[1].id, 'finding_z');
  });

  it('keeps all disjoint findings intact', () => {
    const f1 = createFinding('f1', 0, 10);
    const f2 = createFinding('f2', 15, 25);
    const f3 = createFinding('f3', 30, 40);

    const resolved = resolveOverlaps([f2, f3, f1]);
    assert.equal(resolved.length, 3);
    assert.deepEqual(
      resolved.map((f) => f.id),
      ['f1', 'f2', 'f3']
    );
  });

  it('keeps directly adjacent findings', () => {
    const f1 = createFinding('f1', 0, 5);
    const f2 = createFinding('f2', 5, 10);

    const resolved = resolveOverlaps([f1, f2]);
    assert.equal(resolved.length, 2);
    assert.deepEqual(
      resolved.map((f) => f.id),
      ['f1', 'f2']
    );
  });

  it('drops partially overlapping subsequent finding', () => {
    const f1 = createFinding('first', 0, 10);
    const f2 = createFinding('second_overlapping', 8, 18);

    const resolved = resolveOverlaps([f1, f2]);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].id, 'first');
  });

  it('drops contained finding inside a larger match', () => {
    const parent = createFinding('parent', 0, 30);
    const child = createFinding('contained', 10, 20);

    const resolved = resolveOverlaps([child, parent]);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].id, 'parent');
  });

  it('handles empty and single-element arrays', () => {
    assert.deepEqual(resolveOverlaps([]), []);
    const single = [createFinding('solo', 0, 10)];
    assert.deepEqual(resolveOverlaps(single), single);
  });
});
