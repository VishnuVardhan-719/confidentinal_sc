// @vitest-environment jsdom
/**
 * R9-D10 root cause of the doctor-consultation e2e hangs: the "unsaved changes" beforeunload
 * listener must be gone in the same commit that shows the work as saved. flushSync runs layout
 * effects synchronously but leaves passive effects (useEffect) pending, which is exactly the window
 * a fast reload hit on a busy machine.
 */
import { createElement, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { useUnsavedChangesGuard } from "@/components/clinical/use-unsaved-guard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

let setDirtyOutside: (v: boolean) => void = () => {};
function Editor({ initial }: { initial: boolean }) {
  const [dirty, setDirty] = useState(initial);
  // eslint-disable-next-line react-hooks/globals -- test harness hands the setter to the test body
  setDirtyOutside = setDirty;
  useUnsavedChangesGuard(dirty);
  return createElement("p", null, dirty ? "Unsaved changes" : "Draft saved");
}

/** True when a beforeunload event right now would prompt. */
function wouldPrompt(): boolean {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

describe("useUnsavedChangesGuard", () => {
  it("prompts while dirty and stops in the same commit that renders 'Draft saved'", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    flushSync(() => root.render(createElement(Editor, { initial: true })));
    expect(el.textContent).toBe("Unsaved changes");
    expect(wouldPrompt()).toBe(true);
    flushSync(() => setDirtyOutside(false));
    // No await, no act: passive effects have not run yet. The screen already says saved...
    expect(el.textContent).toBe("Draft saved");
    // ...so leaving must not prompt any more.
    expect(wouldPrompt()).toBe(false);
    flushSync(() => setDirtyOutside(true));
    expect(wouldPrompt()).toBe(true);
    flushSync(() => root.unmount());
    expect(wouldPrompt()).toBe(false);
  });

  it("an async save (default-priority update) drops the prompt before the browser can act on 'Draft saved'", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    flushSync(() => root.render(createElement(Editor, { initial: true })));
    expect(wouldPrompt()).toBe(true);
    // Observe the DOM the moment React writes "Draft saved" (a microtask after the commit task),
    // which is before passive effects run. That is when a test or a user could reload.
    const atSaved = new Promise<boolean>((resolve) => {
      const mo = new MutationObserver(() => {
        if (el.textContent === "Draft saved") {
          mo.disconnect();
          resolve(wouldPrompt());
        }
      });
      mo.observe(el, { subtree: true, characterData: true, childList: true });
    });
    await Promise.resolve().then(() => setDirtyOutside(false));
    expect(await atSaved).toBe(false);
    flushSync(() => root.unmount());
  });
});
