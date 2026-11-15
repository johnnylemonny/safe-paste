import type { DetectorRule, Finding } from '../types';

/**
 * Regular expression for GitHub Classic Personal Access Tokens.
 *
 * Structure:
 * - Prefix: 'ghp_'
 * - Payload: 36 alphanumeric characters (Base62: [A-Za-z0-9])
 * - Total length: 40 UTF-16 code units
 *
 * Boundaries:
 * - Negative lookbehind and lookahead on [A-Za-z0-9_] prevent matching inside
 *   longer identifiers (e.g. `commit_ghp_...` or 45-character strings).
 */
export const GITHUB_PAT_CLASSIC_REGEX =
  /(?<![A-Za-z0-9_])(ghp_[A-Za-z0-9]{36})(?![A-Za-z0-9_])/g;

/**
 * Regular expression for GitHub Fine-grained Personal Access Tokens.
 *
 * Structure:
 * - Prefix: 'github_pat_'
 * - Payload: 82 characters (typically 22 alnum + '_' + 59 alnum, or [A-Za-z0-9_]{82})
 * - Total length: 93 UTF-16 code units
 *
 * Boundaries:
 * - Negative lookbehind and lookahead on [A-Za-z0-9_] prevent matching inside
 *   longer identifiers or trailing garbage.
 */
export const GITHUB_PAT_FINE_GRAINED_REGEX =
  /(?<![A-Za-z0-9_])(github_pat_[A-Za-z0-9_]{82})(?![A-Za-z0-9_])/g;

/**
 * Detector rule for GitHub Classic Personal Access Tokens (ghp_...).
 */
export const githubPatClassicRule: DetectorRule = {
  id: 'github_pat_classic',
  category: 'github_pat_classic',
  detect(text: string): readonly Finding[] {
    const findings: Finding[] = [];
    const regex = new RegExp(GITHUB_PAT_CLASSIC_REGEX.source, 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      findings.push({
        id: `github_pat_classic_${start}_${end}`,
        category: 'github_pat_classic',
        range: { start, end },
        mask: 'ghp_••••••••',
        replacementText: '[REDACTED_GITHUB_PAT]',
      });
    }

    return findings;
  },
};

/**
 * Detector rule for GitHub Fine-grained Personal Access Tokens (github_pat_...).
 */
export const githubPatFineGrainedRule: DetectorRule = {
  id: 'github_pat_fine_grained',
  category: 'github_pat_fine_grained',
  detect(text: string): readonly Finding[] {
    const findings: Finding[] = [];
    const regex = new RegExp(GITHUB_PAT_FINE_GRAINED_REGEX.source, 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      findings.push({
        id: `github_pat_fine_grained_${start}_${end}`,
        category: 'github_pat_fine_grained',
        range: { start, end },
        mask: 'github_pat_••••••••',
        replacementText: '[REDACTED_GITHUB_PAT]',
      });
    }

    return findings;
  },
};

/**
 * Default MVP rule set covering GitHub Classic and Fine-grained PATs.
 */
export const defaultMvpRules: readonly DetectorRule[] = [
  githubPatClassicRule,
  githubPatFineGrainedRule,
];
