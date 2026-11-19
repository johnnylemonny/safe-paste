import { describe, expect, it } from 'vitest';
import {
  isSupportedGitHubEditor,
  extractPastedPlaintext,
  isTrustedEvent,
  SUPPORTED_GITHUB_EDITOR_SELECTORS,
} from '../../src/adapter/editor';

describe('Adapter: Editor Recognition & Event Helpers', () => {
  describe('isSupportedGitHubEditor', () => {
    it('identifies GitHub issue and comment textareas by selector matching', () => {
      for (const selector of SUPPORTED_GITHUB_EDITOR_SELECTORS) {
        const mockTextarea = {
          tagName: 'TEXTAREA',
          matches: (sel: string) => sel === selector,
        };
        expect(isSupportedGitHubEditor(mockTextarea)).toBe(true);
      }
    });

    it('identifies textareas by exact name, id, and class attributes via fallback', () => {
      expect(isSupportedGitHubEditor({ tagName: 'TEXTAREA', name: 'issue[body]' })).toBe(true);
      expect(isSupportedGitHubEditor({ tagName: 'TEXTAREA', id: 'issue_body' })).toBe(true);
      expect(isSupportedGitHubEditor({ tagName: 'TEXTAREA', name: 'comment[body]' })).toBe(true);
      expect(isSupportedGitHubEditor({ tagName: 'TEXTAREA', id: 'new_comment_field' })).toBe(true);
      expect(
        isSupportedGitHubEditor({
          tagName: 'TEXTAREA',
          className: 'form-control js-comment-field js-paste-markdown',
        })
      ).toBe(true);
    });

    it('rejects generic or unrelated textareas outside the strict allowlist', () => {
      // Formerly accepted by broad substring matching, now strictly rejected
      expect(isSupportedGitHubEditor({ tagName: 'TEXTAREA', name: 'post_body' })).toBe(false);
      expect(isSupportedGitHubEditor({ tagName: 'TEXTAREA', name: 'user[bio]' })).toBe(false);
      expect(isSupportedGitHubEditor({ tagName: 'TEXTAREA', name: 'repo[description]' })).toBe(false);
      expect(isSupportedGitHubEditor({ tagName: 'TEXTAREA', id: 'commit_comment_body' })).toBe(false);
      expect(isSupportedGitHubEditor({ tagName: 'TEXTAREA', className: 'generic-comment-box' })).toBe(false);
    });

    it('rejects input elements, contenteditables, and other tags', () => {
      const titleInput = {
        tagName: 'INPUT',
        name: 'issue[title]',
      };
      expect(isSupportedGitHubEditor(titleInput)).toBe(false);

      const div = {
        tagName: 'DIV',
        className: 'js-comment-field',
      };
      expect(isSupportedGitHubEditor(div)).toBe(false);

      expect(isSupportedGitHubEditor(null)).toBe(false);
      expect(isSupportedGitHubEditor(undefined)).toBe(false);
      expect(isSupportedGitHubEditor({})).toBe(false);
    });
  });

  describe('extractPastedPlaintext', () => {
    it('extracts plaintext from ClipboardEvent clipboardData', () => {
      const mockEvent = {
        clipboardData: {
          getData: (type: string) => (type === 'text/plain' ? 'pasted secret data' : ''),
        },
      } as unknown as ClipboardEvent;

      expect(extractPastedPlaintext(mockEvent)).toBe('pasted secret data');
    });

    it('returns null if clipboardData is missing or empty', () => {
      const emptyEvent = {
        clipboardData: {
          getData: () => '',
        },
      } as unknown as ClipboardEvent;
      expect(extractPastedPlaintext(emptyEvent)).toBe(null);

      const noDataEvent = {} as unknown as ClipboardEvent;
      expect(extractPastedPlaintext(noDataEvent)).toBe(null);
    });
  });

  describe('isTrustedEvent', () => {
    it('returns true only for trusted user events', () => {
      expect(isTrustedEvent({ isTrusted: true } as Event)).toBe(true);
      expect(isTrustedEvent({ isTrusted: false } as Event)).toBe(false);
      expect(isTrustedEvent({} as Event)).toBe(false);
    });
  });
});
