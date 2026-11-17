import { validateSessionIntegrity, type PasteSession } from './session';

export type ReplacementResult =
  | {
      readonly success: true;
      readonly newText: string;
    }
  | {
      readonly success: false;
      readonly reason: 'expired' | 'stale' | 'invalid_status' | 'editor_detached';
      readonly error: string;
    };

/**
 * Safely replaces the sensitive range in the target editor with the redacted text,
 * validating session freshness, editor connectivity, and content integrity before writing.
 */
export function applyRedactionToEditor(
  session: PasteSession,
  redactedPastedText: string,
  now: number = Date.now()
): ReplacementResult {
  const editor = session.editor;

  // Check if editor is still attached in DOM if isConnected is supported
  if (typeof editor.isConnected === 'boolean' && !editor.isConnected) {
    session.status = 'stale';
    return {
      success: false,
      reason: 'editor_detached',
      error: 'The editor is no longer attached to the document.',
    };
  }

  // Pre-write integrity check: verify session has not expired and editor content was not modified
  const integrity = validateSessionIntegrity(session, editor.value, now);
  if (!integrity.valid) {
    return {
      success: false,
      reason: integrity.reason,
      error: integrity.error,
    };
  }

  // Compute the new editor value by replacing exactly the pasted target range
  const { start, end } = session.targetRange;
  const currentVal = editor.value;

  const prefix = currentVal.slice(0, start);
  const suffix = currentVal.slice(end);
  const newValue = prefix + redactedPastedText + suffix;

  // Update editor value
  editor.value = newValue;

  // Reposition selection to end of the newly inserted redacted text
  const newSelectionPos = start + redactedPastedText.length;
  if (typeof editor.setSelectionRange === 'function') {
    editor.setSelectionRange(newSelectionPos, newSelectionPos);
  } else {
    editor.selectionStart = newSelectionPos;
    editor.selectionEnd = newSelectionPos;
  }

  // Dispatch standard input event so GitHub listeners (draft auto-save, markdown preview) synchronize
  const inputEvent = new Event('input', { bubbles: true, cancelable: false });
  editor.dispatchEvent(inputEvent);

  // Mark session as successfully redacted
  session.status = 'redacted';

  return {
    success: true,
    newText: newValue,
  };
}
