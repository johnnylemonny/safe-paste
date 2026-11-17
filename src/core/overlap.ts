import type { Finding } from './types';

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
 * Sorts and resolves overlapping findings using deterministic range merging.
 *
 * Security Guarantee:
 * Never silently loses coverage of detected sensitive ranges.
 * If two findings overlap (e.g. [10, 40) and [30, 60)), their ranges are merged
 * into a single unified range [10, 60) so that no sensitive characters are left unredacted.
 * Directly adjacent findings (e.g. [0, 5) and [5, 10)) are preserved as distinct findings.
 */
export function resolveOverlaps(findings: readonly Finding[]): Finding[] {
  if (findings.length <= 1) {
    return [...findings];
  }

  const sorted = [...findings].sort(compareFindings);
  const first = sorted[0];
  if (!first) {
    return [];
  }

  const resolved: Finding[] = [];
  let current: Finding = first;

  for (let i = 1; i < sorted.length; i++) {
    const candidate = sorted[i];
    if (!candidate) {
      continue;
    }

    // If candidate starts before current ends, they overlap
    if (candidate.range.start < current.range.end) {
      const mergedEnd = Math.max(current.range.end, candidate.range.end);
      const isExpanded = candidate.range.end > current.range.end;

      current = {
        id: isExpanded ? `${current.id}+${candidate.id}` : current.id,
        category: current.category,
        mask: current.mask,
        replacementText: current.replacementText,
        range: {
          start: current.range.start,
          end: mergedEnd,
        },
      };
    } else {
      resolved.push(current);
      current = candidate;
    }
  }

  resolved.push(current);
  return resolved;
}
