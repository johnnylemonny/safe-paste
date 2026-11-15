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

  it('merges partially overlapping findings to ensure complete sensitive range coverage', () => {
    // Finding A: [10, 40), Finding B: [30, 60)
    // Merged: [10, 60) so that [40, 60) is never leaked unredacted
    const f1 = createFinding('finding_a', 10, 40);
    const f2 = createFinding('finding_b', 30, 60);

    const resolved = resolveOverlaps([f1, f2]);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].range.start, 10);
    assert.equal(resolved[0].range.end, 60);
    assert.equal(resolved[0].id, 'finding_a+finding_b');
  });

  it('merges transitively overlapping findings across multiple ranges', () => {
    // A: [10, 30), B: [25, 45), C: [40, 65) -> all overlap transitively into [10, 65)
    const f1 = createFinding('f1', 10, 30);
    const f2 = createFinding('f2', 25, 45);
    const f3 = createFinding('f3', 40, 65);

    const resolved = resolveOverlaps([f2, f3, f1]);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].range.start, 10);
    assert.equal(resolved[0].range.end, 65);
  });

  it('subsumes contained finding inside a larger match without shrinking', () => {
    const parent = createFinding('parent', 0, 30);
    const child = createFinding('contained', 10, 20);

    const resolved = resolveOverlaps([child, parent]);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].id, 'parent');
    assert.equal(resolved[0].range.start, 0);
    assert.equal(resolved[0].range.end, 30);
  });

  it('handles empty and single-element arrays', () => {
    assert.deepEqual(resolveOverlaps([]), []);
    const single = [createFinding('solo', 0, 10)];
    assert.deepEqual(resolveOverlaps(single), single);
  });
});
