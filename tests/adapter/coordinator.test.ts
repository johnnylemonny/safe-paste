import { describe, expect, it } from 'vitest';
import { PasteSessionCoordinator } from '../../src/adapter/coordinator';
import type { DetectionResult } from '../../src/core/types';

function createMockEditor(initialValue = ''): HTMLTextAreaElement {
  const events: Event[] = [];
  const state = {
    tagName: 'TEXTAREA',
    name: 'issue[body]',
    value: initialValue,
    selectionStart: initialValue.length,
    selectionEnd: initialValue.length,
    isConnected: true,
    setSelectionRange(start: number, end: number) {
      state.selectionStart = start;
      state.selectionEnd = end;
    },
    dispatchEvent(event: Event) {
      events.push(event);
      return true;
    },
    _events: events,
  };
  return state as unknown as HTMLTextAreaElement;
}

function createMockPasteEvent(
  target: unknown,
  pastedText: string,
  isTrusted = true
): { event: ClipboardEvent; preventDefaultCalled: boolean } {
  let preventDefaultCalled = false;
  const event = {
    isTrusted,
    target,
    clipboardData: {
      getData: (type: string) => (type === 'text/plain' ? pastedText : ''),
    },
    preventDefault() {
      preventDefaultCalled = true;
    },
    stopPropagation() {},
  } as unknown as ClipboardEvent;

  return { event, preventDefaultCalled };
}

describe('Adapter: PasteSessionCoordinator', () => {
  it('processes trusted paste on supported editor without calling preventDefault', async () => {
    const editor = createMockEditor('Header: ');
    editor.selectionStart = 8;
    editor.selectionEnd = 8;

    const mockFindings = [
      {
        id: 'f1',
        category: 'github_pat_classic' as const,
        range: { start: 0, end: 12 },
        mask: 'ghp_••••••••',
        replacementText: '[REDACTED_PAT]',
      },
    ];

    const mockDetect = (text: string): DetectionResult => {
      if (text.includes('secret')) {
        return {
          status: 'findings',
          findings: mockFindings,
        };
      }
      return { status: 'clean', findings: [] };
    };

    let sessionReceived: unknown = null;
    const coordinator = new PasteSessionCoordinator({
      detectFn: mockDetect,
      onFindings: (session) => {
        sessionReceived = session;
      },
    });

    const pastedText = 'secret_token_123';
    const { event, preventDefaultCalled } = createMockPasteEvent(editor, pastedText, true);

    // Native browser updates editor value after paste
    coordinator.handlePasteEvent(event);
    expect(preventDefaultCalled).toBe(false);

    // Simulate native paste insertion in editor
    editor.value = `Header: ${pastedText}`;

    // Wait for microtask integrity check
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

    expect(sessionReceived).not.toBeNull();
    const session = coordinator.getActiveSession(editor);
    expect(session).toBeDefined();
    expect(session?.status).toBe('active');
    expect(session?.targetRange).toEqual({ start: 8, end: 8 + pastedText.length });
    expect(session?.snapshotValue).toBe(`Header: ${pastedText}`);

    // Now execute redaction
    if (session) {
      const redactResult = coordinator.executeRedaction(session);
      expect(redactResult.success).toBe(true);
      expect(editor.value).toBe('Header: [REDACTED_PAT]_123');
      expect(session.status).toBe('redacted');
    }
  });

  it('ignores untrusted (programmatic) paste events', async () => {
    const editor = createMockEditor('');
    let onFindingsCalled = false;
    const coordinator = new PasteSessionCoordinator({
      onFindings: () => {
        onFindingsCalled = true;
      },
    });

    const { event } = createMockPasteEvent(editor, 'secret', false); // isTrusted: false
    coordinator.handlePasteEvent(event);
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

    expect(onFindingsCalled).toBe(false);
    expect(coordinator.getActiveSession(editor)).toBeUndefined();
  });

  it('ignores unsupported elements (e.g. input fields)', async () => {
    const inputElement = {
      tagName: 'INPUT',
      name: 'issue[title]',
    };

    let onFindingsCalled = false;
    const coordinator = new PasteSessionCoordinator({
      onFindings: () => {
        onFindingsCalled = true;
      },
    });

    const { event } = createMockPasteEvent(inputElement, 'secret', true);
    coordinator.handlePasteEvent(event);
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

    expect(onFindingsCalled).toBe(false);
  });

  it('supersedes previous active session when new paste occurs on the same editor', async () => {
    const editor = createMockEditor('');
    const mockFindings = [
      {
        id: 'f1',
        category: 'github_pat_classic' as const,
        range: { start: 0, end: 6 },
        mask: 'ghp_••••••••',
        replacementText: '[REDACTED]',
      },
    ];

    const coordinator = new PasteSessionCoordinator({
      detectFn: () => ({ status: 'findings', findings: mockFindings }),
    });

    // First paste
    const { event: event1 } = createMockPasteEvent(editor, 'secret1');
    coordinator.handlePasteEvent(event1);
    editor.value = 'secret1';
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

    const session1 = coordinator.getActiveSession(editor);
    expect(session1?.status).toBe('active');

    // Second paste
    const { event: event2 } = createMockPasteEvent(editor, 'secret2');
    coordinator.handlePasteEvent(event2);
    editor.value = 'secret1secret2';
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

    const session2 = coordinator.getActiveSession(editor);
    expect(session1?.status).toBe('dismissed');
    expect(session2?.status).toBe('active');
    expect(session2?.id).not.toBe(session1?.id);
  });
});
