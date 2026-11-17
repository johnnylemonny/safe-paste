export const GITHUB_TEXTAREA_SELECTORS = [
  'textarea.js-comment-field',
  'textarea.comment-form-textarea',
  'textarea#issue_body',
  'textarea[name="issue[body]"]',
  'textarea[name="comment[body]"]',
  'textarea[name="pull_request_review_comment[body]"]',
  'textarea[placeholder*="comment" i]',
  'textarea[placeholder*="leave a comment" i]',
] as const;

/**
 * Validates if a target element is a supported GitHub textarea editor.
 */
export function isSupportedGitHubEditor(target: unknown): target is HTMLTextAreaElement {
  if (!target || typeof target !== 'object') {
    return false;
  }

  const el = target as Partial<HTMLTextAreaElement>;
  if (el.tagName !== 'TEXTAREA') {
    return false;
  }

  // If matches function is available (standard in DOM)
  if (typeof el.matches === 'function') {
    for (const selector of GITHUB_TEXTAREA_SELECTORS) {
      if (el.matches(selector)) {
        return true;
      }
    }
  }

  // Fallback heuristic: check name, id, or className attributes
  const name = el.name ?? '';
  const id = el.id ?? '';
  const className = el.className ?? '';

  if (
    name.includes('body') ||
    name.includes('comment') ||
    id.includes('issue_body') ||
    id.includes('comment') ||
    className.includes('comment-form') ||
    className.includes('js-comment')
  ) {
    return true;
  }

  return false;
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
