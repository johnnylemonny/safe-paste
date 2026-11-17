import { describe, expect, it } from 'vitest';
import {
  isSupportedGitHubEditor,
  extractPastedPlaintext,
  isTrustedEvent,
} from '../../src/adapter/editor';

describe('Adapter: Editor Recognition & Event Helpers', () => {
  describe('isSupportedGitHubEditor', () => {
    it('identifies GitHub issue and comment textareas by selector matching', () => {
      const mockTextarea = {
        tagName: 'TEXTAREA',
        matches: (selector: string) => selector === 'textarea.js-comment-field',
      };
      expect(isSupportedGitHubEditor(mockTextarea)).toBe(true);
    });

    it('identifies textareas by name and id attributes via fallback', () => {
      const issueBody = {
        tagName: 'TEXTAREA',
        name: 'issue[body]',
      };
      expect(isSupportedGitHubEditor(issueBody)).toBe(true);

      const commentBody = {
        tagName: 'TEXTAREA',
        name: 'comment[body]',
      };
      expect(isSupportedGitHubEditor(commentBody)).toBe(true);

      const issueId = {
        tagName: 'TEXTAREA',
        id: 'issue_body',
      };
      expect(isSupportedGitHubEditor(issueId)).toBe(true);
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
    it('returns true only when isTrusted is explicitly true', () => {
      expect(isTrustedEvent({ isTrusted: true } as Event)).toBe(true);
      expect(isTrustedEvent({ isTrusted: false } as Event)).toBe(false);
      expect(isTrustedEvent({} as Event)).toBe(false);
    });
  });
});
