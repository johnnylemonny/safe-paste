import type { Finding } from '../core/types';

export type SessionStatus = 'active' | 'expired' | 'stale' | 'redacted' | 'dismissed';

export const DEFAULT_SESSION_TTL_MS = 60_000; // 60 seconds TTL

export interface PasteSession {
  readonly id: string;
  readonly editor: HTMLTextAreaElement;
  readonly createdAt: number;
  readonly ttlMs: number;
  readonly pastedText: string;
  readonly targetRange: { readonly start: number; readonly end: number };
  readonly snapshotValue: string;
  readonly findings: readonly Finding[];
  status: SessionStatus;
}

let sessionCounter = 0;

export function generateSessionId(): string {
  sessionCounter += 1;
  return `session_${Date.now()}_${sessionCounter}`;
}

export function createPasteSession(params: {
  editor: HTMLTextAreaElement;
  pastedText: string;
  targetRange: { start: number; end: number };
  snapshotValue: string;
  findings: readonly Finding[];
  ttlMs?: number;
  createdAt?: number;
}): PasteSession {
  return {
    id: generateSessionId(),
    editor: params.editor,
    createdAt: params.createdAt ?? Date.now(),
    ttlMs: params.ttlMs ?? DEFAULT_SESSION_TTL_MS,
    pastedText: params.pastedText,
    targetRange: params.targetRange,
    snapshotValue: params.snapshotValue,
    findings: params.findings,
    status: 'active',
  };
}

export function isSessionExpired(session: PasteSession, now: number = Date.now()): boolean {
  return now - session.createdAt >= session.ttlMs;
}

export function validateSessionIntegrity(
  session: PasteSession,
  currentValue: string,
  now: number = Date.now()
):
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly reason: 'expired' | 'stale' | 'invalid_status';
      readonly error: string;
    } {
  if (session.status !== 'active') {
    return {
      valid: false,
      reason: 'invalid_status',
      error: `Session is no longer active (current status: ${session.status})`,
    };
  }

  if (isSessionExpired(session, now)) {
    session.status = 'expired';
    return {
      valid: false,
      reason: 'expired',
      error: "SafePaste's review session has expired. Please review your text manually or paste it again.",
    };
  }

  if (currentValue !== session.snapshotValue) {
    session.status = 'stale';
    return {
      valid: false,
      reason: 'stale',
      error: 'The editor content has changed. SafePaste could not apply the redaction. Please review your text manually or paste it again.',
    };
  }

  return { valid: true };
}
