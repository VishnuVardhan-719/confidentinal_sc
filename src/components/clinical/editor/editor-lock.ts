/**
 * The consultation editor accepts edits and saves only when the visit is writable, the draft is
 * not final and no sign request is pending. A save during signing would bump the draft version
 * and race the finalize call (CodeRabbit on 0f4b8da).
 */
export function editorLocked(s: { writable: boolean; finalized: boolean; signing: boolean }): boolean {
  return !s.writable || s.finalized || s.signing;
}
