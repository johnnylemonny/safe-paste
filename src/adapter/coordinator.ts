import { detect } from '../core/detect';
import { redact } from '../core/redact';
import type { DetectionResult, RedactionResult } from '../core/types';
import { extractPastedPlaintext, isSupportedGitHubEditor, isTrustedEvent } from './editor';
import { applyRedactionToEditor, type ReplacementResult } from './replacement';
import {
  createPasteSession,
  type PasteSession,
} from './session';

export interface AdapterOptions {
  readonly root?: Document | HTMLElement;
  readonly detectFn?: (text: string) => DetectionResult;
  readonly redactFn?: (text: string, targets: Parameters<typeof redact>[1]) => RedactionResult;
  readonly onFindings?: (session: PasteSession) => void;
}

export class PasteSessionCoordinator {
  private readonly activeSessions = new WeakMap<HTMLTextAreaElement, PasteSession>();
  private readonly detectFn: (text: string) => DetectionResult;
  private readonly redactFn: (text: string, targets: Parameters<typeof redact>[1]) => RedactionResult;
  private readonly onFindings: ((session: PasteSession) => void) | undefined;

  constructor(options: AdapterOptions = {}) {
    this.detectFn = options.detectFn ?? detect;
    this.redactFn = options.redactFn ?? redact;
    this.onFindings = options.onFindings;
  }

  public getActiveSession(editor: HTMLTextAreaElement): PasteSession | undefined {
    return this.activeSessions.get(editor);
  }

  public handlePasteEvent(event: ClipboardEvent): void {
    // 1. Validate user-initiated trusted event
    if (!isTrustedEvent(event)) {
      return;
    }

    const target = event.target;
    // 2. Validate supported GitHub editor
    if (!isSupportedGitHubEditor(target)) {
      return;
    }

    const editor: HTMLTextAreaElement = target;

    // 3. Extract plaintext without blocking or modifying native paste
    const pastedText = extractPastedPlaintext(event);
    if (!pastedText) {
      return;
    }

    // 4. Capture pre-paste editor state
    const prePasteValue = editor.value;
    const preSelectionStart = editor.selectionStart ?? 0;
    const preSelectionEnd = editor.selectionEnd ?? preSelectionStart;

    // 5. Run detection over pasted plaintext
    const detection = this.detectFn(pastedText);
    if (detection.status !== 'findings' || detection.findings.length === 0) {
      return;
    }

    // 6. One-time post-paste integrity verification (after native paste finishes)
    queueMicrotask(() => {
      // If editor was detached or replaced during paste, abort
      if (typeof editor.isConnected === 'boolean' && !editor.isConnected) {
        return;
      }

      const postPasteValue = editor.value;
      const replacedSelectionLen = preSelectionEnd - preSelectionStart;
      const insertedLen = postPasteValue.length - (prePasteValue.length - replacedSelectionLen);

      const targetRange = {
        start: preSelectionStart,
        end: preSelectionStart + insertedLen,
      };

      // Invalidate existing session for this editor if present
      const previousSession = this.activeSessions.get(editor);
      if (previousSession && previousSession.status === 'active') {
        previousSession.status = 'dismissed';
      }

      // Create new session
      const session = createPasteSession({
        editor,
        pastedText,
        targetRange,
        snapshotValue: postPasteValue,
        findings: detection.findings,
      });

      this.activeSessions.set(editor, session);

      // Notify consumer / UI
      if (typeof this.onFindings === 'function') {
        this.onFindings(session);
      }
    });
  }

  /**
   * Executes redaction for an active session.
   */
  public executeRedaction(session: PasteSession, now?: number): ReplacementResult {
    const redactionTargets = session.findings.map((f) => ({
      range: f.range,
      replacementText: f.replacementText,
    }));

    const redaction = this.redactFn(session.pastedText, redactionTargets);
    if (!redaction.success) {
      session.status = 'stale';
      return {
        success: false,
        reason: 'stale',
        error: `Core redaction failed: ${redaction.error}`,
      };
    }

    return applyRedactionToEditor(session, redaction.text, now);
  }

  /**
   * Dismisses an active session.
   */
  public dismissSession(session: PasteSession): void {
    if (session.status === 'active') {
      session.status = 'dismissed';
    }
  }
}

/**
 * Initializes global delegated paste handling on document.
 */
export function initPasteAdapter(options: AdapterOptions = {}): () => void {
  const coordinator = new PasteSessionCoordinator(options);
  const root = options.root ?? document;

  const listener = (event: Event) => {
    coordinator.handlePasteEvent(event as ClipboardEvent);
  };

  root.addEventListener('paste', listener, { capture: true });

  return () => {
    root.removeEventListener('paste', listener, { capture: true });
  };
}
