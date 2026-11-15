import type { Finding } from './types.ts';

/**
 * Deterministically compares two findings.
 * Primary: ascending start offset.
 * Secondary: descending end offset (longer match wins on identical start).
 * Tertiary: deterministic tie-breaker by id.
 */
export function compareFindings(a: Finding, b: Finding): number {
  if (a.range.start !== b.range.start) {
    return a.range.start - b.range.start;
  }
  if (a.range.end !== b.range.end) {
    return b.range.end - a.range.end;
  }
  return a.id.localeCompare(b.id);
}

/**
 * Sorts and resolves overlapping findings using a deterministic greedy interval selection.
 * Retains longer/earlier matches and discards overlapping subsequent findings.
 */
export function resolveOverlaps(findings: readonly Finding[]): Finding[] {
  if (findings.length <= 1) {
    return [...findings];
  }

  const sorted = [...findings].sort(compareFindings);
  const resolved: Finding[] = [];
  let lastAcceptedEnd = -1;

  for (const finding of sorted) {
    // Only accept if this finding starts at or after the previous accepted end
    if (finding.range.start >= lastAcceptedEnd) {
      resolved.push(finding);
      lastAcceptedEnd = finding.range.end;
    }
  }

  return resolved;
}
