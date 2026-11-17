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

### 2.2 Dynamic GitHub Editor Detection
- Supported targets are verified `HTMLTextAreaElement` instances matching GitHub comment and issue selectors (`.js-comment-field`, `[name="issue[body]"]`, `[name="comment[body]"]`).
- Document-level event delegation eliminates the need for expensive `MutationObserver` instances, effortlessly supporting dynamically mounted, tab-swapped (*Write* / *Preview*), and inline comment editors.

### 2.3 Post-Paste One-Time Integrity Check
- Immediately upon receiving the paste event, the pre-paste selection and value length are recorded.
- In a scheduled post-paste microtask (`queueMicrotask`), once the native browser paste operation has written to the textarea, the exact inserted target range `[start, end)` is resolved and verified against the captured plaintext.
- A transient `PasteSession` is created with a finite lifetime (default: 60s TTL).

### 2.4 Stale Content Protection (Pre-Write Integrity Check)
- SafePaste explicitly does **not** monitor input, keyboard, or mouse events while reviewing.
- Immediately before applying a user-initiated `[Redact]` action, the Adapter compares `editor.value` against `session.snapshotValue`.
- If the user made any manual edits after pasting, the redaction is safely rejected:
  > *“The editor content has changed. SafePaste could not apply the redaction. Please review your text manually or paste it again.”*
  This prevents accidental clobbering of newly typed content.

### 2.5 Safe Replacement & Event Synchronization
- The sensitive range is cleanly substituted with the redacted string.
- Selection is updated to the end of the replaced content.
- A standard bubbling `new Event('input', { bubbles: true })` is dispatched, notifying GitHub's React/custom listeners (draft auto-save, markdown preview) to synchronize state.
