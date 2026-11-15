import { resolveOverlaps } from './overlap.ts';
import type {
  DetectionResult,
  DetectOptions,
  Finding,
} from './types.ts';

export const DEFAULT_MAX_INPUT_LENGTH = 102_400; // ~100 KiB UTF-16 code units
export const DEFAULT_MAX_FINDINGS = 50;

/**
 * Pure orchestrator function to execute detector rules against an input string.
 * Enforces input budgets, caps findings count, and deterministically resolves overlaps.
 */
export function detect(
  text: string,
  options: DetectOptions = {}
): DetectionResult {
  const maxInputLength = options.maxInputLength ?? DEFAULT_MAX_INPUT_LENGTH;
  const maxFindings = options.maxFindings ?? DEFAULT_MAX_FINDINGS;

  // Check input length budget
  if (text.length > maxInputLength) {
    return {
      status: 'limit_exceeded',
      findings: [],
      limitDetails: {
        reason: 'input_too_large',
        limit: maxInputLength,
        actual: text.length,
      },
    };
  }

  // Handle empty input directly
  if (text.length === 0) {
    return {
      status: 'clean',
      findings: [],
    };
  }

  const rules = options.rules ?? [];
  if (rules.length === 0) {
    return {
      status: 'clean',
      findings: [],
    };
  }

  const rawFindings: Finding[] = [];

  for (const rule of rules) {
    const findings = rule.detect(text);
    rawFindings.push(...findings);

    // Halt if finding cap is exceeded
    if (rawFindings.length > maxFindings) {
      return {
        status: 'limit_exceeded',
        findings: [],
        limitDetails: {
          reason: 'too_many_findings',
          limit: maxFindings,
          actual: rawFindings.length,
        },
      };
    }
  }

  const resolved = resolveOverlaps(rawFindings);

  if (resolved.length === 0) {
    return {
      status: 'clean',
      findings: [],
    };
  }

  return {
    status: 'findings',
    findings: resolved,
  };
}
