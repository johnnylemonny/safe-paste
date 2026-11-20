import type { Finding } from '../core/types';

export type SessionStatus = 'active' | 'expired' | 'stale' | 'redacted' | 'dismissed';

export const DEFAULT_SESSION_TTL_MS = 60_000; // 60 seconds TTL

export interface PasteSession {
  readonly id: string;
  readonly editor: HTMLTextAreaElement;
  readonly createdAt: number;
  readonly ttlMs: number;
  pastedText: string;
  readonly targetRange: { readonly start: number; readonly end: number };
  snapshotValue: string;
  readonly findings: readonly Finding[];
  status: SessionStatus;
}

/**
 * Public, secret-free metadata exposed to UI/consumers without raw secrets or snapshots.
 */
export interface PasteSessionInfo {
  readonly sessionId: string;
  readonly editor: HTMLTextAreaElement;
  readonly findings: readonly Finding[];
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

/**
 * Disposes a session, transitioning its status and releasing sensitive in-memory
 * strings (pastedText and snapshotValue) immediately.
 */
export function disposePasteSession(
  session: PasteSession,
  status: SessionStatus = 'dismissed'
): void {
  if (session.status === 'active') {
    session.status = status;
  }
  session.pastedText = '';
  session.snapshotValue = '';
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
    disposePasteSession(session, 'expired');
    return {
      valid: false,
      reason: 'expired',
      error: "SafePaste's review session has expired. Please review your text manually or paste it again.",
    };
  }

  if (currentValue !== session.snapshotValue) {
    disposePasteSession(session, 'stale');
    return {
      valid: false,
      reason: 'stale',
      error: 'The editor content has changed. SafePaste could not apply the redaction. Please review your text manually or paste it again.',
    };
  }

  return { valid: true };
}
