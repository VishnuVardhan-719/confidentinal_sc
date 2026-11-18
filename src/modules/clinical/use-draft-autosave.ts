"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createDraftAutosave, type AutosaveController, type AutosaveOptions, type AutosaveSnapshot } from "./autosave";
import { hasUnsavedWork } from "./draft-machine";

export type UseDraftAutosave = AutosaveSnapshot & Omit<AutosaveController, "getSnapshot" | "subscribe" | "attach">;

/**
 * React binding for the autosave controller. `save`/`fetchLatest` should be server actions (or
 * the http adapter) so the clinical gate and authorization run on the server.
 * Warns before unload while edits are unsaved; tracks browser online/offline.
 */
export function useDraftAutosave(options: AutosaveOptions): UseDraftAutosave {
  // Created once per mounted editor; options are read at creation (consultation switch remounts).
  const [controller] = useState(() => createDraftAutosave(options));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => controller.attach(), [controller]);

  useEffect(() => {
    const sync = () => controller.setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, [controller]);

  const unsaved = hasUnsavedWork(snapshot.draft);
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy browsers need returnValue set; the text is not shown by modern browsers.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  return {
    ...snapshot,
    edit: controller.edit,
    saveNow: controller.saveNow,
    setOnline: controller.setOnline,
    reloadConflict: controller.reloadConflict,
    resolveConflict: controller.resolveConflict,
    markFinalized: controller.markFinalized,
  };
}
