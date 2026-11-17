/**
 * Shared geometry for the hero "care pathway" motif. The static SVG poster and the WebGL scene
 * both draw from this, through the same camera projection, so the scene's first frame matches the poster.
 *
 * The motif is abstract: soft contour lines, one origin point (the patient) and three provider rings.
 * A route draws from the origin to one provider, which then fills to show it accepted. Nothing here
 * represents a real place, provider or availability.
 */
export type Vec2 = readonly [number, number];

export const CAMERA = { fovDeg: 35, distance: 3.5, tilt: 0.5 } as const;
export const ASPECT = 4 / 3;
export const POSTER_W = 520;
export const POSTER_H = POSTER_W / ASPECT;

/** World units for strokes and markers, tuned for a frame roughly 440px wide. */
export const STROKE = { contour: 0.0046, route: 0.0072, ring: 0.0058 } as const;
export const MARKER = { ring: 0.075, fill: 0.05, origin: 0.055, halo: 0.12 } as const;

export const ORIGIN: Vec2 = [-0.72, -0.38];
export const PROVIDERS: readonly Vec2[] = [
  [0.58, 0.52],
  [0.9, -0.14],
  [-0.12, 0.92],
];

function contour(cx: number, cy: number, r: number, k: number): Vec2[] {
  const pts: Vec2[] = [];
  const n = 96;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const rr = r * (1 + 0.075 * Math.sin(3 * t + k * 0.9) + 0.045 * Math.sin(5 * t + k * 1.7));
    pts.push([cx + rr * Math.cos(t) * 1.3, cy + rr * Math.sin(t)]);
  }
  return pts;
}

/** Closed, gently irregular loops, like a calm survey map. Deterministic. */
export function contours(): Vec2[][] {
  const out: Vec2[][] = [];
  for (let k = 0; k < 7; k++) out.push(contour(-0.15, 0.2, 0.22 + 0.2 * k, k));
  for (let k = 0; k < 3; k++) out.push(contour(1.05, 0.95, 0.12 + 0.13 * k, k + 3));
  return out;
}

/** A quadratic route from the origin to provider i, bowed to one side so it reads as a path, not a pointer. */
export function route(i: number, samples = 64): Vec2[] {
  const [x0, y0] = ORIGIN;
  const [x1, y1] = PROVIDERS[i];
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const bow = 0.28;
  const cx = mx - dy * bow;
  const cy = my + dx * bow;
  const pts: Vec2[] = [];
  for (let s = 0; s <= samples; s++) {
    const t = s / samples;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    pts.push([a * x0 + b * cx + c * x1, a * y0 + b * cy + c * y1]);
  }
  return pts;
}

/** Same projection as the scene: plane rotated by -tilt about X, camera on +Z looking at the origin, 4:3 frame. */
export function project([x, y]: Vec2): Vec2 {
  const { tilt, distance, fovDeg } = CAMERA;
  const yr = y * Math.cos(tilt);
  const zr = -y * Math.sin(tilt);
  const depth = distance - zr;
  const f = Math.tan(((fovDeg / 2) * Math.PI) / 180);
  const nx = x / (depth * f * ASPECT);
  const ny = yr / (depth * f);
  return [((nx + 1) / 2) * POSTER_W, ((1 - ny) / 2) * POSTER_H];
}

/** Pixel scale of one world unit at a point, for sizing poster strokes and markers. */
export function pxPerUnit(p: Vec2): number {
  const a = project(p);
  const b = project([p[0] + 0.1, p[1]]);
  return (b[0] - a[0]) / 0.1;
}

/** Points on a circle of radius r around c, in plane coordinates (projected later). */
export function circle(c: Vec2, r: number, n = 48): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]);
  }
  return pts;
}

/** The scene's timeline, in seconds. The poster shows the "hold" state of provider 0. */
export const TIMELINE = { pause: 0.6, draw: 3.0, accept: 0.8, hold: 3.0, fade: 1.0 } as const;
export const CYCLE = TIMELINE.pause + TIMELINE.draw + TIMELINE.accept + TIMELINE.hold + TIMELINE.fade;
export const POSTER_TIME = TIMELINE.pause + TIMELINE.draw + TIMELINE.accept;

export type Phase = { provider: number; draw: number; accept: number; fade: number };

/** Where the loop is at time t: which provider, how much of the route is drawn, fill progress, fade-out. Pure. */
export function phaseAt(t: number): Phase {
  const cycle = Math.floor(t / CYCLE);
  const local = t - cycle * CYCLE;
  const provider = ((cycle % PROVIDERS.length) + PROVIDERS.length) % PROVIDERS.length;
  const { pause, draw, accept, hold, fade } = TIMELINE;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const easeOut = (v: number) => 1 - Math.pow(1 - v, 3);
  return {
    provider,
    draw: easeOut(clamp((local - pause) / draw)),
    accept: easeOut(clamp((local - pause - draw) / accept)),
    fade: clamp((local - pause - draw - accept - hold) / fade),
  };
}