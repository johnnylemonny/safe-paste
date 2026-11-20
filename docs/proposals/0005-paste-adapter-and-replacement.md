# RFC 0005: GitHub Paste Event Handling & Safe Text Replacement

- **Status:** Proposed
- **Author:** johnnylemonny (Webilo)
- **Related Issue:** [#5](https://github.com/necoz-oss/safe-paste/issues/5)
- **Related Architecture:** `docs/design.md` (PR #8)
- **Related Core API:** [RFC 0003](docs/proposals/0003-core-detection-and-redaction-api.md) (PR #9)

---

## 1. Summary

This proposal specifies the architecture and implementation of SafePaste's **GitHub Adapter** layer (`src/adapter/`), addressing [Issue #5](https://github.com/necoz-oss/safe-paste/issues/5).

The Adapter layer coordinates browser events, transient in-memory paste sessions, and safe editor text replacement without ever interfering with native GitHub paste behaviors or introducing continuous keystroke monitoring.

---

## 2. Key Architecture & Design Invariants

### 2.1 Non-Intrusive Native Paste Handling
- The Adapter listens for `paste` events in the capture phase on `document`.
- **Zero interference:** Neither `preventDefault()`, `stopPropagation()`, nor `stopImmediatePropagation()` is ever invoked on the native paste event.
- Plaintext is read directly from `event.clipboardData.getData('text/plain')`, requiring no elevated `clipboardRead` extension permissions.
- Untrusted (`isTrusted === false`) or unsupported element events are immediately ignored.

### 2.2 Strict Supported Editor Allowlist
- To prevent accidentally inspecting unrelated text fields or search boxes, editor recognition uses a strict allowlist limited to GitHub issue descriptions and issue comments:
  - `textarea#issue_body`
  - `textarea[name="issue[body]"]`
  - `textarea#new_comment_field`
  - `textarea[name="comment[body]"]`
  - `textarea.js-comment-field`
- Broad fallback heuristics (such as matching arbitrary names containing `body` or `comment`) are excluded.
- Document-level event delegation dynamically supports all compliant textareas without `MutationObserver` overhead.

### 2.3 Post-Paste Insertion Verification & Macrotask Scheduling
- Immediately upon receiving the paste event, pre-paste selection and value are recorded.
- In a deferred macrotask (`setTimeout(..., 0)`), scheduled after the native browser paste operation completes its default insertion into the textarea:
  - The actual editor value is strictly compared against the expected value (`prePaste.slice(0, start) + pastedText + prePaste.slice(end)`).
  - If GitHub cancelled, transformed, or intercepted the paste, session creation is safely aborted.
  - Plaintext detection runs over the verified insertion, keeping the capture-phase event listener near-zero overhead.
  - A transient `PasteSession` is created with a finite lifetime (default: 60s TTL).

### 2.4 Centralized Session Lifecycle, Invalidation & Disposal
- **Immediate Invalidation on New Paste:** Every new supported paste event immediately cancels any pending callbacks and disposes any previous active session on that editor, regardless of whether the new paste produces findings.
- **Sensitive Data Release:** To uphold the Zero Secret Retention principle, sensitive in-memory strings (`pastedText` and `snapshotValue`) are zeroed out (`''`) immediately upon:
  - TTL expiration (default: 60 seconds)
  - Explicit dismissal (`[Dismiss]`, `Escape`)
  - Redaction completion (success or stale error)
  - Superseding paste
- **Safe Consumer Boundaries:** Downstream UI consumers receive only safe finding metadata and a session identifier (`PasteSessionInfo: { sessionId, editor, findings }`), never raw pasted text or editor snapshots.
- **Strict Redaction Ownership:** Only the currently active session for an editor can execute redaction.

### 2.5 Stale Content Protection (Pre-Write Integrity Check)
- SafePaste explicitly does **not** monitor input, keyboard, or mouse events while reviewing.
- Immediately before applying a user-initiated `[Redact]` action, the Adapter compares `editor.value` against `session.snapshotValue`.
- If the user made any manual edits after pasting, the redaction is safely rejected:
  > *“The editor content has changed. SafePaste could not apply the redaction. Please review your text manually or paste it again.”*
  This prevents accidental clobbering of newly typed content.

### 2.6 Safe Replacement & Event Synchronization
- The sensitive range is cleanly substituted with the redacted string.
- Selection is updated to the end of the replaced content.
- A standard bubbling `new Event('input', { bubbles: true })` is dispatched, notifying GitHub's React/custom listeners (draft auto-save, markdown preview) to synchronize state.
