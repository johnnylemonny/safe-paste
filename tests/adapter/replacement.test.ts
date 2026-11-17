import { describe, expect, it } from 'vitest';
import { applyRedactionToEditor } from '../../src/adapter/replacement';
import { createPasteSession } from '../../src/adapter/session';
import type { Finding } from '../../src/core/types';

function createMockTextarea(initialValue: string): {
  textarea: HTMLTextAreaElement;
  dispatchedEvents: Event[];
} {
  const dispatchedEvents: Event[] = [];
  const state = {
    value: initialValue,
    selectionStart: 0,
    selectionEnd: 0,
    tagName: 'TEXTAREA',
    isConnected: true,
    setSelectionRange(start: number, end: number) {
      state.selectionStart = start;
      state.selectionEnd = end;
    },
    dispatchEvent(event: Event) {
      dispatchedEvents.push(event);
      return true;
    },
  };

  return { textarea: state as unknown as HTMLTextAreaElement, dispatchedEvents };
}

const mockFinding: Finding = {
  id: 'f1',
  category: 'github_pat_classic',
  range: { start: 0, end: 10 },
  mask: 'ghp_••••••••',
  replacementText: '[REDACTED]',
};

describe('Adapter: applyRedactionToEditor', () => {
  it('replaces target range in textarea and dispatches input event', () => {
    const initialText = 'Prefix: GITHUB_TOKEN=ghp_secretTokenHere; Suffix.';
    const pasted = 'GITHUB_TOKEN=ghp_secretTokenHere;';
    const targetStart = 8;
    const targetEnd = targetStart + pasted.length;

    const { textarea, dispatchedEvents } = createMockTextarea(initialText);

    const session = createPasteSession({
      editor: textarea,
      pastedText: pasted,
      targetRange: { start: targetStart, end: targetEnd },
      snapshotValue: initialText,
      findings: [mockFinding],
    });

    const redactedPasted = 'GITHUB_TOKEN=[REDACTED_PAT];';
    const result = applyRedactionToEditor(session, redactedPasted);

    expect(result.success).toBe(true);
    expect(textarea.value).toBe('Prefix: GITHUB_TOKEN=[REDACTED_PAT]; Suffix.');

    // Cursor placed at the end of the replaced content
    const expectedCursor = targetStart + redactedPasted.length;
    expect(textarea.selectionStart).toBe(expectedCursor);
    expect(textarea.selectionEnd).toBe(expectedCursor);

    // Verifies dispatched input event
    expect(dispatchedEvents.length).toBe(1);
    expect(dispatchedEvents[0]?.type).toBe('input');
    expect(dispatchedEvents[0]?.bubbles).toBe(true);

    // Session status updated
    expect(session.status).toBe('redacted');
  });

  it('rejects redaction if editor content was modified after paste (stale check)', () => {
    const initialText = 'original paste';
    const { textarea, dispatchedEvents } = createMockTextarea(initialText);

    const session = createPasteSession({
      editor: textarea,
      pastedText: 'paste',
      targetRange: { start: 9, end: 14 },
      snapshotValue: initialText,
      findings: [mockFinding],
    });

    // User modified textarea manually
    textarea.value = 'original paste with extra edits';

    const result = applyRedactionToEditor(session, '[REDACTED]');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('stale');
    }

    // Textarea value untouched
    expect(textarea.value).toBe('original paste with extra edits');
    expect(dispatchedEvents.length).toBe(0);
    expect(session.status).toBe('stale');
  });

  it('rejects redaction if session has expired', () => {
    const text = 'my token';
    const { textarea } = createMockTextarea(text);
    const createdAt = 10_000;

    const session = createPasteSession({
      editor: textarea,
      pastedText: 'token',
      targetRange: { start: 3, end: 8 },
      snapshotValue: text,
      findings: [mockFinding],
      ttlMs: 5_000,
      createdAt,
    });

    const result = applyRedactionToEditor(session, '[REDACTED]', createdAt + 6_000);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('expired');
    }
  });

  it('rejects redaction if editor was disconnected from DOM', () => {
    const text = 'content';
    const { textarea } = createMockTextarea(text);
    (textarea as { isConnected: boolean }).isConnected = false;

    const session = createPasteSession({
      editor: textarea,
      pastedText: 'content',
      targetRange: { start: 0, end: 7 },
      snapshotValue: text,
      findings: [mockFinding],
    });

    const result = applyRedactionToEditor(session, '[REDACTED]');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('editor_detached');
    }
  });
});
