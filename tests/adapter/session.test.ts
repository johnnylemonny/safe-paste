import { describe, expect, it } from 'vitest';
import {
  createPasteSession,
  isSessionExpired,
  validateSessionIntegrity,
  DEFAULT_SESSION_TTL_MS,
} from '../../src/adapter/session';
import type { Finding } from '../../src/core/types';

function createMockTextarea(value = ''): HTMLTextAreaElement {
  return {
    value,
    selectionStart: 0,
    selectionEnd: 0,
    tagName: 'TEXTAREA',
    isConnected: true,
  } as unknown as HTMLTextAreaElement;
}

const mockFinding: Finding = {
  id: 'finding_1',
  category: 'github_pat_classic',
  range: { start: 10, end: 50 },
  mask: 'ghp_••••••••',
  replacementText: '[REDACTED]',
};

describe('Adapter: PasteSession', () => {
  it('creates an active session with correct defaults', () => {
    const editor = createMockTextarea('test text');
    const now = 1000;

    const session = createPasteSession({
      editor,
      pastedText: 'pasted secret',
      targetRange: { start: 0, end: 13 },
      snapshotValue: 'pasted secret',
      findings: [mockFinding],
      createdAt: now,
    });

    expect(session.id).toMatch(/^session_\d+_\d+$/);
    expect(session.status).toBe('active');
    expect(session.ttlMs).toBe(DEFAULT_SESSION_TTL_MS);
    expect(session.createdAt).toBe(now);
    expect(session.findings.length).toBe(1);
  });

  it('detects session expiration based on TTL', () => {
    const editor = createMockTextarea('test');
    const createdAt = 10_000;
    const session = createPasteSession({
      editor,
      pastedText: 'data',
      targetRange: { start: 0, end: 4 },
      snapshotValue: 'data',
      findings: [mockFinding],
      ttlMs: 5_000,
      createdAt,
    });

    // Before TTL
    expect(isSessionExpired(session, createdAt + 4_999)).toBe(false);
    // At TTL
    expect(isSessionExpired(session, createdAt + 5_000)).toBe(true);
    // Past TTL
    expect(isSessionExpired(session, createdAt + 10_000)).toBe(true);
  });

  it('validates integrity successfully when value matches snapshot and not expired', () => {
    const editor = createMockTextarea('exact snapshot content');
    const now = 20_000;
    const session = createPasteSession({
      editor,
      pastedText: 'content',
      targetRange: { start: 15, end: 22 },
      snapshotValue: 'exact snapshot content',
      findings: [mockFinding],
      createdAt: now,
    });

    const result = validateSessionIntegrity(session, 'exact snapshot content', now + 1_000);
    expect(result.valid).toBe(true);
  });

  it('marks session as stale and rejects validation if editor content changed', () => {
    const editor = createMockTextarea('modified content');
    const now = 20_000;
    const session = createPasteSession({
      editor,
      pastedText: 'original',
      targetRange: { start: 0, end: 8 },
      snapshotValue: 'original content',
      findings: [mockFinding],
      createdAt: now,
    });

    const result = validateSessionIntegrity(session, 'modified content', now + 1_000);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('stale');
    }
    expect(session.status).toBe('stale');
  });

  it('marks session as expired and rejects validation if TTL elapsed', () => {
    const editor = createMockTextarea('content');
    const createdAt = 1_000;
    const session = createPasteSession({
      editor,
      pastedText: 'content',
      targetRange: { start: 0, end: 7 },
      snapshotValue: 'content',
      findings: [mockFinding],
      ttlMs: 10_000,
      createdAt,
    });

    const result = validateSessionIntegrity(session, 'content', createdAt + 15_000);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('expired');
    }
    expect(session.status).toBe('expired');
  });

  it('rejects validation when session is not in active status', () => {
    const editor = createMockTextarea('content');
    const session = createPasteSession({
      editor,
      pastedText: 'content',
      targetRange: { start: 0, end: 7 },
      snapshotValue: 'content',
      findings: [mockFinding],
    });

    session.status = 'dismissed';
    const result = validateSessionIntegrity(session, 'content');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('invalid_status');
    }
  });
});
