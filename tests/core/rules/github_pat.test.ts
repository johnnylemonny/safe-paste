import { describe, expect, it } from 'vitest';
import {
  githubPatClassicRule,
  githubPatFineGrainedRule,
  defaultMvpRules,
} from '../../../src/core/rules/github_pat';
import { detect } from '../../../src/core/detect';

describe('GitHub PAT Detector Rules', () => {
  // Synthetic test tokens (40 chars and 93 chars respectively)
  const syntheticClassicPat = 'ghp_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const syntheticFineGrainedPat =
    'github_pat_01234567890123456789AB_01234567890123456789012345678901234567890123456789012345678';

  describe('githubPatClassicRule (Classic PAT)', () => {
    it('detects a standalone Classic PAT', () => {
      const findings = Array.from(githubPatClassicRule.detect(syntheticClassicPat));
      expect(findings.length).toBe(1);
      const f = findings[0]!;
      expect(f.category).toBe('github_pat_classic');
      expect(f.mask).toBe('ghp_••••••••');
      expect(f.replacementText).toBe('[REDACTED_GITHUB_PAT]');
      expect(f.range).toEqual({ start: 0, end: 40 });
    });

    it('detects Classic PAT in environment variable assignments and export lines', () => {
      const input = `export GITHUB_TOKEN="${syntheticClassicPat}"\necho "ready"`;
      const findings = Array.from(githubPatClassicRule.detect(input));
      expect(findings.length).toBe(1);
      const expectedStart = input.indexOf(syntheticClassicPat);
      expect(findings[0]!.range).toEqual({
        start: expectedStart,
        end: expectedStart + 40,
      });
    });

    it('detects Classic PAT in URLs and Authorization headers', () => {
      const urlInput = `https://${syntheticClassicPat}@github.com/repo.git`;
      const findings = Array.from(githubPatClassicRule.detect(urlInput));
      expect(findings.length).toBe(1);
      const expectedStart = urlInput.indexOf(syntheticClassicPat);
      expect(findings[0]!.range).toEqual({
        start: expectedStart,
        end: expectedStart + 40,
      });
    });

    it('detects multiple Classic PATs in the same text', () => {
      const token1 = 'ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const token2 = 'ghp_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
      const input = `Primary: ${token1}, Backup: ${token2}`;
      const findings = Array.from(githubPatClassicRule.detect(input));
      expect(findings.length).toBe(2);
      expect(findings[0]!.range).toEqual({ start: 9, end: 49 });
      expect(findings[1]!.range).toEqual({ start: 59, end: 99 });
    });

    it('rejects tokens that do not match the exact 36-char length requirement', () => {
      // 35 characters
      const tooShort = 'ghp_0123456789ABCDEFGHIJKLMNOPQRSTUVWXY';
      // 37 characters
      const tooLong = 'ghp_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0';

      expect(Array.from(githubPatClassicRule.detect(tooShort)).length).toBe(0);
      expect(Array.from(githubPatClassicRule.detect(tooLong)).length).toBe(0);
    });

    it('rejects tokens embedded in longer identifiers or words', () => {
      // Preceded or followed by word characters / underscores
      const prefixBound = `prefix_${syntheticClassicPat}`;
      const suffixBound = `${syntheticClassicPat}_suffix`;
      const innerBound = `abc${syntheticClassicPat}xyz`;

      expect(Array.from(githubPatClassicRule.detect(prefixBound)).length).toBe(0);
      expect(Array.from(githubPatClassicRule.detect(suffixBound)).length).toBe(0);
      expect(Array.from(githubPatClassicRule.detect(innerBound)).length).toBe(0);
    });

    it('rejects tokens containing invalid characters (e.g. hyphens or special symbols)', () => {
      const invalidChars = 'ghp_0123456789ABCDEFGHI-KLMNOPQRSTUVWXYZ';
      expect(Array.from(githubPatClassicRule.detect(invalidChars)).length).toBe(0);
    });

    it('handles adjacent punctuation correctly (brackets, quotes, commas)', () => {
      const input = `("${syntheticClassicPat}"), ['${syntheticClassicPat}'], <${syntheticClassicPat}>`;
      const findings = Array.from(githubPatClassicRule.detect(input));
      expect(findings.length).toBe(3);
    });
  });

  describe('githubPatFineGrainedRule (Fine-grained PAT)', () => {
    it('detects a standalone Fine-grained PAT', () => {
      const findings = Array.from(githubPatFineGrainedRule.detect(syntheticFineGrainedPat));
      expect(findings.length).toBe(1);
      const f = findings[0]!;
      expect(f.category).toBe('github_pat_fine_grained');
      expect(f.mask).toBe('github_pat_••••••••');
      expect(f.replacementText).toBe('[REDACTED_GITHUB_PAT]');
      expect(f.range).toEqual({ start: 0, end: 93 });
    });

    it('detects Fine-grained PAT in multiline config text', () => {
      const input = `# Config\npat = "${syntheticFineGrainedPat}"\nactive = true`;
      const findings = Array.from(githubPatFineGrainedRule.detect(input));
      expect(findings.length).toBe(1);
      const expectedStart = input.indexOf(syntheticFineGrainedPat);
      expect(findings[0]!.range).toEqual({
        start: expectedStart,
        end: expectedStart + 93,
      });
    });

    it('rejects Fine-grained PAT with incorrect payload length', () => {
      const tooShort = syntheticFineGrainedPat.slice(0, 92);
      const tooLong = syntheticFineGrainedPat + '0';

      expect(Array.from(githubPatFineGrainedRule.detect(tooShort)).length).toBe(0);
      expect(Array.from(githubPatFineGrainedRule.detect(tooLong)).length).toBe(0);
    });

    it('rejects embedded Fine-grained PATs bounded by word characters', () => {
      const embedded = `token_${syntheticFineGrainedPat}_test`;
      expect(Array.from(githubPatFineGrainedRule.detect(embedded)).length).toBe(0);
    });
  });

  describe('Integration with detect orchestrator', () => {
    it('runs defaultMvpRules through detect orchestrator', () => {
      const mixed = `Classic: ${syntheticClassicPat} and Fine: ${syntheticFineGrainedPat}`;
      const result = detect(mixed, { rules: defaultMvpRules });

      expect(result.status).toBe('findings');
      expect(result.findings.length).toBe(2);
      expect(result.findings[0]!.category).toBe('github_pat_classic');
      expect(result.findings[1]!.category).toBe('github_pat_fine_grained');
    });

    it('is immune to catastrophic backtracking (ReDoS test)', () => {
      // Highly repetitive near-match string
      const evilPrefix = 'ghp_' + 'A'.repeat(35);
      const evilString = evilPrefix.repeat(100) + '!';

      const startTime = performance.now();
      const findings = Array.from(githubPatClassicRule.detect(evilString));
      const duration = performance.now() - startTime;

      expect(findings.length).toBe(0);
      // Execution must complete in under 50ms
      expect(duration).toBeLessThan(50);
    });

    it('satisfies Zero Secret Retention: finding never stores raw token value', () => {
      const findings = Array.from(githubPatClassicRule.detect(syntheticClassicPat));
      expect(findings.length).toBe(1);
      const finding = findings[0]!;

      expect(Object.keys(finding)).toEqual([
        'id',
        'category',
        'range',
        'mask',
        'replacementText',
      ]);
      expect(finding).not.toHaveProperty('value');
      expect(finding).not.toHaveProperty('raw');
      expect(finding).not.toHaveProperty('secret');
    });

    it('enforces budget across multiple PAT rules and halts candidate generation', () => {
      const mixed = `${syntheticClassicPat} ${syntheticFineGrainedPat} ${syntheticClassicPat}`;

      // Limit of 2: both Classic tokens + 1 Fine-grained token would be 3 findings total
      const result = detect(mixed, {
        rules: defaultMvpRules,
        maxFindings: 2,
      });

      expect(result.status).toBe('limit_exceeded');
      expect(result.findings.length).toBe(0);
      expect(result.limitDetails).toEqual({
        reason: 'too_many_findings',
        limit: 2,
        actual: 3,
      });
    });

    it('completes normally when PAT findings count is exactly at budget', () => {
      const mixed = `${syntheticClassicPat} ${syntheticFineGrainedPat}`;

      const result = detect(mixed, {
        rules: defaultMvpRules,
        maxFindings: 2,
      });

      expect(result.status).toBe('findings');
      expect(result.findings.length).toBe(2);
    });
  });
});
