"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Central motion gate for marketing surfaces only. Never use motion on forms, auth, booking or emergency screens.
 *
 * - "reveal": light DOM reveals (Anime.js). Needs no reduced-motion and no save-data.
 * - "scene":  the WebGL hero. Also needs a viewport >= 768px, WebGL, and the browser to have gone idle.
 */
export type MotionKind = "reveal" | "scene";

export type MotionEnv = {
  reducedMotion: boolean;
  saveData: boolean;
  viewportWidth: number;
  webgl: boolean;
  idle: boolean;
};

export type MotionDecision = { ok: boolean; reasons: string[] };

export const SCENE_MIN_WIDTH = 768;

/** Pure decision logic, kept separate from browser APIs so it can be unit tested. */
export function evaluateMotion(env: MotionEnv, kind: MotionKind): MotionDecision {
  const reasons: string[] = [];
  if (env.reducedMotion) reasons.push("reduced-motion");
  if (env.saveData) reasons.push("save-data");
  if (kind === "scene") {
    if (env.viewportWidth < SCENE_MIN_WIDTH) reasons.push("narrow-viewport");
    if (!env.webgl) reasons.push("no-webgl");
    if (!env.idle) reasons.push("not-idle");
  }
  return { ok: reasons.length === 0, reasons };
}

type NetworkInformationLike = { saveData?: boolean; addEventListener?: (t: "change", cb: () => void) => void; removeEventListener?: (t: "change", cb: () => void) => void };

function connection(): NetworkInformationLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

const REDUCED = "(prefers-reduced-motion: reduce)";
const WIDE = `(min-width: ${SCENE_MIN_WIDTH}px)`;

/** Snapshot is a short string so useSyncExternalStore can compare it cheaply. Server snapshot is the most restrictive. */
function snapshot(): string {
  const reduced = window.matchMedia(REDUCED).matches ? 1 : 0;
  const wide = window.matchMedia(WIDE).matches ? 1 : 0;
  const saveData = connection()?.saveData ? 1 : 0;
  return `${reduced}${wide}${saveData}`;
}

function subscribe(cb: () => void) {
  const mqs = [window.matchMedia(REDUCED), window.matchMedia(WIDE)];
  mqs.forEach((mq) => mq.addEventListener("change", cb));
  const conn = connection();
  conn?.addEventListener?.("change", cb);
  return () => {
    mqs.forEach((mq) => mq.removeEventListener("change", cb));
    conn?.removeEventListener?.("change", cb);
  };
}

let webglCache: boolean | undefined;

/** Probe once per page; release the probe context immediately. */
export function hasWebGL(): boolean {
  if (webglCache !== undefined) return webglCache;
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    webglCache = Boolean(gl);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglCache = false;
  }
  return webglCache;
}

function onIdle(cb: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(cb, { timeout: 2500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(cb, 1200);
  return () => window.clearTimeout(id);
}

/** Returns false on the server and on first client render, so markup never mismatches and the static fallback paints first. */
export function useMotionOk(kind: MotionKind): boolean {
  const snap = useSyncExternalStore(subscribe, snapshot, () => "100");
  const [idleState, setIdleState] = useState<{ idle: boolean; webgl: boolean }>({ idle: false, webgl: false });

  useEffect(() => {
    if (kind !== "scene") return;
    return onIdle(() => setIdleState({ idle: true, webgl: hasWebGL() }));
  }, [kind]);

  const env: MotionEnv = {
    reducedMotion: snap[0] === "1",
    viewportWidth: snap[1] === "1" ? SCENE_MIN_WIDTH : 0,
    saveData: snap[2] === "1",
    webgl: idleState.webgl,
    idle: idleState.idle,
  };
  return evaluateMotion(env, kind).ok;
}
