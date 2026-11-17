import { describe, expect, it } from 'vitest';
import { detect } from '../../src/core/detect';
import type { DetectorRule, Finding } from '../../src/core/types';

describe('Core Detect Module', () => {
  it('returns clean status for empty input', () => {
    const result = detect('');
    expect(result).toEqual({
      status: 'clean',
      findings: [],
    });
  });

  it('returns clean status when no rules are provided', () => {
    const result = detect('some arbitrary text');
    expect(result).toEqual({
      status: 'clean',
      findings: [],
    });
  });

  it('halts with limit_exceeded when input exceeds maxInputLength budget', () => {
    const largeText = 'a'.repeat(200);
    const result = detect(largeText, { maxInputLength: 100 });

    expect(result.status).toBe('limit_exceeded');
    expect(result.findings.length).toBe(0);
    expect(result.limitDetails).toEqual({
      reason: 'input_too_large',
      limit: 100,
      actual: 200,
    });
  });

  it('halts with limit_exceeded when finding count exceeds maxFindings cap', () => {
    const syntheticRule: DetectorRule = {
      id: 'mock_repeating_rule',
      category: 'mock_category',
      detect: () => {
        const matches: Finding[] = [];
        for (let i = 0; i < 10; i++) {
          matches.push({
            id: `mock_${i}`,
            category: 'mock_category',
            range: { start: i * 2, end: i * 2 + 1 },
            mask: 'mock_••••',
            replacementText: '[MOCK]',
          });
        }
        return matches;
      },
    };

    const result = detect('test string', {
      rules: [syntheticRule],
      maxFindings: 5,
    });

    expect(result.status).toBe('limit_exceeded');
    expect(result.findings.length).toBe(0);
    expect(result.limitDetails).toEqual({
      reason: 'too_many_findings',
      limit: 5,
      actual: 10,
    });
  });

  it('executes rules and resolves overlaps into clean findings result', () => {
    const text = 'prefix ghp_syntheticDummyKey123 suffix';
    const syntheticPattern = 'ghp_syntheticDummyKey123';

    const testRule: DetectorRule = {
      id: 'synthetic_github_pat_classic',
      category: 'github_pat_classic',
      detect: (src: string) => {
        const idx = src.indexOf(syntheticPattern);
        if (idx === -1) return [];
        return [
          {
            id: `github_pat_classic_${idx}`,
            category: 'github_pat_classic',
            range: { start: idx, end: idx + syntheticPattern.length },
            mask: 'ghp_••••••••',
            replacementText: '[REDACTED_GITHUB_PAT]',
          },
        ];
      },
    };

    const result = detect(text, { rules: [testRule] });

    expect(result.status).toBe('findings');
    expect(result.findings.length).toBe(1);
    const finding = result.findings[0];
    expect(finding).toBeDefined();
    if (!finding) return;

    expect(finding.category).toBe('github_pat_classic');
    expect(finding.mask).toBe('ghp_••••••••');
    expect(finding.replacementText).toBe('[REDACTED_GITHUB_PAT]');
    expect(finding.range).toEqual({
      start: 7,
      end: 7 + syntheticPattern.length,
    });

    // Verify Zero Secret Retention: The raw secret string must not exist on the finding object
    const findingKeys = Object.keys(finding);
    expect(findingKeys.includes('rawSecret')).toBe(false);
    expect(findingKeys.includes('secret')).toBe(false);
    expect(findingKeys.includes('value')).toBe(false);
  });
});
