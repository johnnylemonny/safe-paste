import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { redact, validateRange } from '../../src/core/redact.ts';
import type { RedactionTarget } from '../../src/core/types.ts';

describe('Core Redact Module', () => {
  it('handles empty input and empty targets gracefully', () => {
    const result = redact('', []);
    assert.deepEqual(result, {
      success: true,
      text: '',
      appliedCount: 0,
    });
  });

  it('preserves text intact when targets array is empty', () => {
    const input = 'This is safe text with no tokens.\nLine 2.\tTabbed.';
    const result = redact(input, []);
    assert.deepEqual(result, {
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
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.text, 'GITHUB_TOKEN=[REDACTED_GITHUB_PAT] in issue config');
      assert.equal(result.appliedCount, 1);
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
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.text, '[REDACTED_1] and [REDACTED_2]');
      assert.equal(result.appliedCount, 2);
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
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.text, '[REDACTED_ALL]');
      assert.equal(result.appliedCount, 1);
    }
  });

  it('correctly handles adjacent matches without gaps', () => {
    const input = 'AAABBB';
    const targets: RedactionTarget[] = [
      { range: { start: 0, end: 3 }, replacementText: '[FIRST]' },
      { range: { start: 3, end: 6 }, replacementText: '[SECOND]' },
    ];

    const result = redact(input, targets);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.text, '[FIRST][SECOND]');
      assert.equal(result.appliedCount, 2);
    }
  });

  it('rejects overlapping target ranges', () => {
    const input = '0123456789';
    const targets: RedactionTarget[] = [
      { range: { start: 2, end: 6 }, replacementText: '[A]' },
      { range: { start: 5, end: 8 }, replacementText: '[B]' },
    ];

    const result = redact(input, targets);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.reason, 'overlapping_targets');
    }
  });

  it('rejects out of bounds and inverted ranges', () => {
    const input = 'hello';

    // Negative start
    const res1 = redact(input, [{ range: { start: -1, end: 3 }, replacementText: 'X' }]);
    assert.equal(res1.success, false);
    if (!res1.success) assert.equal(res1.reason, 'invalid_range');

    // Start > End
    const res2 = redact(input, [{ range: { start: 4, end: 2 }, replacementText: 'X' }]);
    assert.equal(res2.success, false);
    if (!res2.success) assert.equal(res2.reason, 'invalid_range');

    // End > length
    const res3 = redact(input, [{ range: { start: 0, end: 10 }, replacementText: 'X' }]);
    assert.equal(res3.success, false);
    if (!res3.success) assert.equal(res3.reason, 'invalid_range');

    // Non-integer offsets
    const res4 = redact(input, [{ range: { start: 1.5, end: 3 }, replacementText: 'X' }]);
    assert.equal(res4.success, false);
    if (!res4.success) assert.equal(res4.reason, 'invalid_range');
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

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(
        result.text,
        `\`\`\`bash
export TOKEN="[REDACTED_PAT]"
echo "done"
\`\`\``
      );
    }
  });

  it('preserves Unicode astral plane characters (emojis) correctly', () => {
    // Emoji '🚀' is 2 UTF-16 code units (\uD83D\uDE80)
    // Emoji '✨' is 1 UTF-16 code unit (\u2728)
    const token = 'ghp_syntheticTokenBetweenEmojis';
    const input = `🚀 Launch: ${token} ✨ done!`;

    const start = input.indexOf(token);
    const end = start + token.length;

    const result = redact(input, [
      { range: { start, end }, replacementText: '[SECRET]' },
    ]);

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.text, '🚀 Launch: [SECRET] ✨ done!');
    }
  });

  it('rejects ranges that split a Unicode surrogate pair', () => {
    const input = 'A🚀B'; // 'A' (idx 0), '🚀' (idx 1, 2: \uD83D\uDE80), 'B' (idx 3)

    // Attempt to slice in the middle of the rocket emoji (start at 2, inside surrogate)
    const invalidTarget: RedactionTarget = {
      range: { start: 2, end: 3 },
      replacementText: '[SPLIT]',
    };

    const result = redact(input, [invalidTarget]);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.reason, 'surrogate_boundary_split');
    }
  });
});
