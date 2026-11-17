import { initPasteAdapter } from './coordinator';

// GitHub content-script entry point.
// Listens to native paste events, runs best-effort detection, and coordinates sessions.
if (typeof document !== 'undefined') {
  initPasteAdapter({
    onFindings: (session) => {
      // Presentation is handled by UI (Issue #6).
      // For this PoC milestone, findings are linked to the active session.
      console.info(`[SafePaste] Detected ${session.findings.length} potential secret(s) in paste.`);
    },
  });
}
