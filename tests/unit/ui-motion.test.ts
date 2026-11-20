import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { evaluateMotion, SCENE_MIN_WIDTH, type MotionEnv } from "@/components/motion/use-motion-ok";
import { WordReveal } from "@/components/motion/word-reveal";
import { StepTrack } from "@/components/motion/step-track";
import { CYCLE, POSTER_H, POSTER_TIME, POSTER_W, PROVIDERS, phaseAt, project } from "@/components/marketing/hero-geometry";

const allowed: MotionEnv = { reducedMotion: false, saveData: false, viewportWidth: 1280, webgl: true, idle: true };

describe("evaluateMotion", () => {
  it("allows reveals and the scene when every check passes", () => {
    expect(evaluateMotion(allowed, "reveal")).toEqual({ ok: true, reasons: [] });
    expect(evaluateMotion(allowed, "scene")).toEqual({ ok: true, reasons: [] });
  });

  it("blocks everything under reduced motion or save-data", () => {
    for (const env of [{ ...allowed, reducedMotion: true }, { ...allowed, saveData: true }]) {
      expect(evaluateMotion(env, "reveal").ok).toBe(false);
      expect(evaluateMotion(env, "scene").ok).toBe(false);
    }
  });

  it("gates the scene on width, WebGL and idle, but not reveals", () => {
    const cases: [Partial<MotionEnv>, string][] = [
      [{ viewportWidth: SCENE_MIN_WIDTH - 1 }, "narrow-viewport"],
      [{ webgl: false }, "no-webgl"],
      [{ idle: false }, "not-idle"],
    ];
    for (const [patch, reason] of cases) {
      const env = { ...allowed, ...patch };
      expect(evaluateMotion(env, "scene")).toEqual({ ok: false, reasons: [reason] });
      expect(evaluateMotion(env, "reveal").ok).toBe(true);
    }
    expect(evaluateMotion({ ...allowed, viewportWidth: SCENE_MIN_WIDTH }, "scene").ok).toBe(true);
  });

  it("reports every failing reason", () => {
    const env: MotionEnv = { reducedMotion: true, saveData: true, viewportWidth: 390, webgl: false, idle: false };
    expect(evaluateMotion(env, "scene").reasons).toEqual(["reduced-motion", "save-data", "narrow-viewport", "no-webgl", "not-idle"]);
  });
});

describe("hero scene timeline", () => {
  it("starts in the poster state so the canvas swap is seamless", () => {
    expect(phaseAt(POSTER_TIME)).toEqual({ provider: 0, draw: 1, accept: 1, fade: 0 });
  });

  it("starts each cycle empty and moves to the next provider", () => {
    expect(phaseAt(0)).toMatchObject({ provider: 0, draw: 0, accept: 0, fade: 0 });
    expect(phaseAt(CYCLE + 0.01).provider).toBe(1);
    expect(phaseAt(CYCLE * PROVIDERS.length + 0.01).provider).toBe(0);
    expect(phaseAt(CYCLE - 0.001).fade).toBeGreaterThan(0.99);
  });

  it("projects every marker inside the poster frame", () => {
    for (const p of PROVIDERS) {
      const [x, y] = project(p);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(POSTER_W);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(POSTER_H);
    }
  });
});

describe("motion markup is visible by default", () => {
  it("WordReveal keeps one readable copy for assistive tech and hides the animated words", () => {
    const out = renderToStaticMarkup(createElement(WordReveal, { text: "You choose. The provider accepts." }));
    expect(out).toContain('<span class="visually-hidden">You choose. The provider accepts.</span>');
    expect(out).not.toMatch(/style="[^"]*(opacity|transform)/);
  });

  it("StepTrack renders an ordered list with a decorative connector", () => {
    const out = renderToStaticMarkup(createElement(StepTrack, { steps: [{ title: "A", body: "a" }, { title: "B", body: "b" }] }));
    expect(out).toContain('<ol class="track">');
    expect(out.match(/<li /g)).toHaveLength(2);
    expect(out).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(out).not.toMatch(/style="[^"]*opacity/);
  });
});
