import { describe, expect, it } from 'vitest';
import { redact } from '../../src/core/redact';
import type { RedactionTarget } from '../../src/core/types';

describe('Core Redact Module', () => {
  it('handles empty input and empty targets gracefully', () => {
    const result = redact('', []);
    expect(result).toEqual({
      success: true,
      text: '',
      appliedCount: 0,
    });
  });

  it('preserves text intact when targets array is empty', () => {
    const input = 'This is safe text with no tokens.\nLine 2.\tTabbed.';
    const result = redact(input, []);
    expect(result).toEqual({
      success: true,
      text: input,
      appliedCount: 0,
    });
  });

  it('redacts a single token in the middle of a string', () => {
    const syntheticToken = 'ghp_syntheticTestToken1234567890';
    const input = `GITHUB_TOKEN=${syntheticToken} in issue config`;
    const start = input.indexOf(syntheticToken);
    const end = start + syntheticToken.length;

    const target: RedactionTarget = {
      range: { start, end },
      replacementText: '[REDACTED_GITHUB_PAT]',
    };

    const result = redact(input, [target]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.text).toBe('GITHUB_TOKEN=[REDACTED_GITHUB_PAT] in issue config');
      expect(result.appliedCount).toBe(1);
    }
  });

  it('redacts tokens at the exact start and exact end of input', () => {
    const token1 = 'ghp_syntheticStartToken123456789';
    const token2 = 'ghp_syntheticEndToken98765432100';
    const input = `${token1} and ${token2}`;

    const targets: RedactionTarget[] = [
      {
        range: { start: 0, end: token1.length },
        replacementText: '[REDACTED_1]',
      },
      {
        range: { start: input.length - token2.length, end: input.length },
        replacementText: '[REDACTED_2]',
      },
    ];

    const result = redact(input, targets);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.text).toBe('[REDACTED_1] and [REDACTED_2]');
      expect(result.appliedCount).toBe(2);
    }
  });

  it('replaces entire string when match spans from 0 to text.length', () => {
    const input = 'ghp_syntheticWholeStringToken123';
    const result = redact(input, [
      {
        range: { start: 0, end: input.length },
        replacementText: '[REDACTED_ALL]',
      },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.text).toBe('[REDACTED_ALL]');
      expect(result.appliedCount).toBe(1);
    }
  });

  it('correctly handles adjacent matches without gaps', () => {
    const input = 'AAABBB';
    const targets: RedactionTarget[] = [
      { range: { start: 0, end: 3 }, replacementText: '[FIRST]' },
      { range: { start: 3, end: 6 }, replacementText: '[SECOND]' },
    ];

    const result = redact(input, targets);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.text).toBe('[FIRST][SECOND]');
      expect(result.appliedCount).toBe(2);
    }
  });

  it('rejects overlapping target ranges', () => {
    const input = '0123456789';
    const targets: RedactionTarget[] = [
      { range: { start: 2, end: 6 }, replacementText: '[A]' },
      { range: { start: 5, end: 8 }, replacementText: '[B]' },
    ];

    const result = redact(input, targets);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('overlapping_targets');
    }
  });

  it('rejects out of bounds and inverted ranges', () => {
    const input = 'hello';

    // Negative start
    const res1 = redact(input, [{ range: { start: -1, end: 3 }, replacementText: 'X' }]);
    expect(res1.success).toBe(false);
    if (!res1.success) expect(res1.reason).toBe('invalid_range');

    // Start > End
    const res2 = redact(input, [{ range: { start: 4, end: 2 }, replacementText: 'X' }]);
    expect(res2.success).toBe(false);
    if (!res2.success) expect(res2.reason).toBe('invalid_range');

    // End > length
    const res3 = redact(input, [{ range: { start: 0, end: 10 }, replacementText: 'X' }]);
    expect(res3.success).toBe(false);
    if (!res3.success) expect(res3.reason).toBe('invalid_range');

    // Non-integer offsets
    const res4 = redact(input, [{ range: { start: 1.5, end: 3 }, replacementText: 'X' }]);
    expect(res4.success).toBe(false);
    if (!res4.success) expect(res4.reason).toBe('invalid_range');
  });

  it('preserves multiline formatting, code fences, and special characters', () => {
    const syntheticToken = 'ghp_syntheticCodeFenceSecret1234';
    const input = `\`\`\`bash
export TOKEN="${syntheticToken}"
echo "done"
\`\`\``;

    const start = input.indexOf(syntheticToken);
    const end = start + syntheticToken.length;

    const result = redact(input, [
      { range: { start, end }, replacementText: '[REDACTED_PAT]' },
    ]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.text).toBe(
        `\`\`\`bash
export TOKEN="[REDACTED_PAT]"
echo "done"
\`\`\``
      );
    }
  });

  it('preserves Unicode astral plane characters (emojis) correctly', () => {
    const token = 'ghp_syntheticTokenBetweenEmojis';
    const input = `🚀 Launch: ${token} ✨ done!`;

    const start = input.indexOf(token);
    const end = start + token.length;

    const result = redact(input, [
      { range: { start, end }, replacementText: '[SECRET]' },
    ]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.text).toBe('🚀 Launch: [SECRET] ✨ done!');
    }
  });

  it('rejects ranges that split a Unicode surrogate pair', () => {
    const input = 'A🚀B'; // 'A' (idx 0), '🚀' (idx 1, 2: \uD83D\uDE80), 'B' (idx 3)

    const invalidTarget: RedactionTarget = {
      range: { start: 2, end: 3 },
      replacementText: '[SPLIT]',
    };

    const result = redact(input, [invalidTarget]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('surrogate_boundary_split');
    }
  });
});
