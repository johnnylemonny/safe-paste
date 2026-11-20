export const SUPPORTED_GITHUB_EDITOR_SELECTORS = [
  'textarea#issue_body',
  'textarea[name="issue[body]"]',
  'textarea#new_comment_field',
  'textarea[name="comment[body]"]',
  'textarea.js-comment-field',
] as const;

/**
 * Validates if a target element is a supported GitHub textarea editor
 * restricted strictly to GitHub issue descriptions and issue comments.
 */
export function isSupportedGitHubEditor(target: unknown): target is HTMLTextAreaElement {
  if (!target || typeof target !== 'object') {
    return false;
  }

  const el = target as Partial<HTMLTextAreaElement>;
  if (el.tagName !== 'TEXTAREA') {
    return false;
  }

  // Check strict allowlist using matches if available
  if (typeof el.matches === 'function') {
    for (const selector of SUPPORTED_GITHUB_EDITOR_SELECTORS) {
      if (el.matches(selector)) {
        return true;
      }
    }
    return false;
  }

  // Exact fallback check for environments without Element.prototype.matches
  const id = el.id ?? '';
  const name = el.name ?? '';
  const className = el.className ?? '';

  return (
    id === 'issue_body' ||
    name === 'issue[body]' ||
    id === 'new_comment_field' ||
    name === 'comment[body]' ||
    className.split(/\s+/).includes('js-comment-field')
  );
}

/**
 * Extracts plaintext from a paste ClipboardEvent safely without modifying or blocking it.
 */
export function extractPastedPlaintext(event: ClipboardEvent): string | null {
  const data = event.clipboardData?.getData('text/plain');
  if (!data || data.length === 0) {
    return null;
  }
  return data;
}

/**
 * Validates that an event was initiated directly by user interaction (not synthetic dispatch).
 */
export function isTrustedEvent(event: Event): boolean {
  return event.isTrusted === true;
}
