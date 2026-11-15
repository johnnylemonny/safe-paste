# RFC 0004: Initial Sensitive-Data Detection Rules & Tests

- **Status:** Proposed
- **Author:** johnnylemonny (Webilo)
- **Related Issue:** [#4](https://github.com/necoz-oss/safe-paste/issues/4)
- **Originating Discussion:** [Necoz Discussion #3](https://github.com/orgs/necoz-oss/discussions/3)
- **Related Architecture:** `docs/design.md` (PR #8)
- **Related Core API:** [RFC 0003](docs/proposals/0003-core-detection-and-redaction-api.md) (PR #9)

---

## 1. Summary

This proposal defines the first concrete set of pure TypeScript sensitive-data detection rules for SafePaste, addressing [Issue #4](https://github.com/necoz-oss/safe-paste/issues/4).

In strict alignment with the MVP scope defined in `docs/design.md`:
- Focuses exclusively on **GitHub Personal Access Tokens (Classic and Fine-grained PATs)**.
- Implements the pure `DetectorRule` interface from the `Core` module (`src/core/types.ts`).
- Operates 100% locally with zero external network requests (never authenticates or validates tokens with GitHub).
- Uses linear-time regular expressions with strict word boundaries to avoid catastrophic backtracking (ReDoS) and prevent false positives from longer hashes or commit SHAs.
- Satisfies the **Zero Secret Retention** principle: generated `Finding` metadata holds safe presentation masks (`ghp_••••••••` and `github_pat_••••••••`) and offset ranges, never storing the raw matched token.

---

## 2. Token Grammars and Structural Matching

Official GitHub token formats follow distinct prefix and payload structures:

### 2.1 GitHub Classic Personal Access Token (Classic PAT)

- **Prefix:** `ghp_` (4 characters).
- **Payload:** 36 alphanumeric characters (`[A-Za-z0-9]{36}`).
- **Total length:** 40 UTF-16 code units.
- **Regular Expression:**
  ```regex
  (?<![A-Za-z0-9_])(ghp_[A-Za-z0-9]{36})(?![A-Za-z0-9_])
  ```
- **Boundary Rationale:**
  - Negative lookbehind `(?<![A-Za-z0-9_])` prevents matching if `ghp_` is preceded by an underscore or alphanumeric character (e.g., `variable_ghp_...`).
  - Negative lookahead `(?![A-Za-z0-9_])` prevents matching if the match is merely the start of a longer string (e.g. 45 characters).

---

### 2.2 GitHub Fine-grained Personal Access Token (Fine-grained PAT)

- **Prefix:** `github_pat_` (11 characters).
- **Payload:** 82 characters (`[A-Za-z0-9_]{82}`, typically 22 alphanumeric characters, an underscore separator `_`, and 59 alphanumeric characters).
- **Total length:** 93 UTF-16 code units.
- **Regular Expression:**
  ```regex
  (?<![A-Za-z0-9_])(github_pat_[A-Za-z0-9_]{82})(?![A-Za-z0-9_])
  ```
- **Boundary Rationale:**
  - Prevents matching incomplete prefixes (`github_pat_`) or arbitrary identifiers containing `github_pat_` as a substring.

---

## 3. Security, Privacy & ReDoS Protections

1. **ReDoS Immunity:**
   - Both regular expressions contain **no nested quantifiers** (e.g. `(a+)+`) and **no ambiguous branches**.
   - Quantifiers are strictly bounded fixed counts (`{36}` and `{82}`).
   - Regex engines execute these in deterministic linear time $O(n)$ relative to input length.
2. **Local-Only Execution:**
   - No token validation against `api.github.com`.
   - Detection remains best-effort structural matching.
3. **Zero Secret Retention:**
   - Downstream consumers (Adapter and UI) receive only the fixed mask (`ghp_••••••••` or `github_pat_••••••••`) and redaction metadata (`[REDACTED_GITHUB_PAT]`).
   - The raw token is never copied to the finding object, preventing DOM inspection or storage leaks.

---

## 4. Test Matrix

All contract tests use **strictly synthetic tokens**:
- Positive tests: standalone tokens, shell exports, HTTP headers, Git URLs, Markdown code blocks, inline backticks, adjacent punctuation.
- Negative tests: prefix only, incomplete tokens, overlength tokens, tokens embedded in identifiers, invalid characters, 40-char git commit SHAs.
- In-memory secret leakage validation.
