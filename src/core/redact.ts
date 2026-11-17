import type { RedactionResult, RedactionTarget, TextRange } from './types';

function isLeadingSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isTrailingSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Validates range boundaries and ensures they do not split a Unicode surrogate pair.
 */
export function validateRange(
  range: TextRange,
  sourceLength: number,
  sourceText?: string
):
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly reason: 'invalid_range' | 'surrogate_boundary_split';
      readonly error: string;
    } {
  const { start, end } = range;

  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return {
      valid: false,
      reason: 'invalid_range',
      error: `Range start and end must be integers; received start=${start}, end=${end}`,
    };
  }

  if (start < 0 || end < start || end > sourceLength) {
    return {
      valid: false,
      reason: 'invalid_range',
      error: `Range [${start}, ${end}) is out of bounds for string of length ${sourceLength}`,
    };
  }

  if (sourceText !== undefined) {
    // Slicing inside a surrogate pair at start
    if (
      start > 0 &&
      start < sourceLength &&
      isTrailingSurrogate(sourceText.charCodeAt(start)) &&
      isLeadingSurrogate(sourceText.charCodeAt(start - 1))
    ) {
      return {
        valid: false,
        reason: 'surrogate_boundary_split',
        error: `Range start offset ${start} splits a Unicode surrogate pair`,
      };
    }

    // Slicing inside a surrogate pair at end
    if (
      end > 0 &&
      end < sourceLength &&
      isTrailingSurrogate(sourceText.charCodeAt(end)) &&
      isLeadingSurrogate(sourceText.charCodeAt(end - 1))
    ) {
      return {
        valid: false,
        reason: 'surrogate_boundary_split',
        error: `Range end offset ${end} splits a Unicode surrogate pair`,
      };
    }
  }

  return { valid: true };
}

/**
 * Deterministically replaces target ranges with replacement text, preserving 100% of
 * unredacted content without side effects or mutations.
 */
export function redact(
  sourceText: string,
  targets: readonly RedactionTarget[]
): RedactionResult {
  if (targets.length === 0) {
    return {
      success: true,
      text: sourceText,
      appliedCount: 0,
    };
  }

  // Sort targets by start ascending
  const sortedTargets = [...targets].sort((a, b) => a.range.start - b.range.start);

  let lastEnd = 0;
  for (const target of sortedTargets) {
    const validation = validateRange(target.range, sourceText.length, sourceText);
    if (!validation.valid) {
      return {
        success: false,
        reason: validation.reason,
        error: validation.error,
      };
    }

    if (target.range.start < lastEnd) {
      return {
        success: false,
        reason: 'overlapping_targets',
        error: `Target range [${target.range.start}, ${target.range.end}) overlaps with previous target ending at ${lastEnd}`,
      };
    }

    lastEnd = target.range.end;
  }

  let cursor = 0;
  let result = '';

  for (const target of sortedTargets) {
    result += sourceText.slice(cursor, target.range.start);
    result += target.replacementText;
    cursor = target.range.end;
  }
  result += sourceText.slice(cursor);

  return {
    success: true,
    text: result,
    appliedCount: sortedTargets.length,
  };
}
