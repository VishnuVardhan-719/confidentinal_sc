"use client";

import { useEffect, useRef } from "react";
import {
  CircleGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  RingGeometry,
  Scene,
  WebGLRenderer,
  BufferGeometry,
  Float32BufferAttribute,
  type Material,
  type Object3D,
} from "three";
import {
  CAMERA,
  MARKER,
  ORIGIN,
  POSTER_TIME,
  PROVIDERS,
  STROKE,
  contours,
  phaseAt,
  route,
  type Vec2,
} from "./hero-geometry";

/** Flat ribbon along a polyline, so strokes have real width (WebGL lines are always 1px). */
function ribbon(points: Vec2[], width: number, closed = false): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const prev = points[i === 0 ? (closed ? n - 2 : 0) : i - 1];
    const next = points[i === n - 1 ? (closed ? 1 : n - 1) : i + 1];
    let dx = next[0] - prev[0];
    let dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const h = width / 2;
    pos.push(points[i][0] - dy * h, points[i][1] + dx * h, 0, points[i][0] + dy * h, points[i][1] - dx * h, 0);
    if (i < n - 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function cssColor(name: string, fallback: string): Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new Color(v || fallback);
}

function material(color: Color, opacity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false });
}

/**
 * The hero's one WebGL scene: a calm care-pathway on a tilted survey-map plane.
 * Mounted only after useMotionOk("scene"); renders its first frame in the poster's state, then loops.
 * Pauses when the tab is hidden or the canvas is offscreen; disposes every GL resource on unmount.
 */
export default function HeroScene({ className, onReady }: { className?: string; onReady?: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onReady);

  useEffect(() => {
    readyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      return; // WebGL refused at runtime; the poster stays.
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    host.appendChild(renderer.domElement);

    const forest = cssColor("--forest", "#0f5f59");
    const lineStrong = cssColor("--line-strong", "#8fa9a3");
    const paper = cssColor("--paper", "#faf8f2");

    const scene = new Scene();
    const camera = new PerspectiveCamera(CAMERA.fovDeg, 4 / 3, 0.1, 50);
    camera.position.set(0, 0, CAMERA.distance);
    camera.lookAt(0, 0, 0);

    const plane = new Group();
    plane.rotation.x = -CAMERA.tilt;
    scene.add(plane);

    let order = 0;
    const add = (o: Mesh) => {
      o.renderOrder = order++;
      plane.add(o);
      return o;
    };

    const contourMat = material(lineStrong, 0.7);
    for (const c of contours()) add(new Mesh(ribbon(c, STROKE.contour, true), contourMat));

    const routes = PROVIDERS.map((_, i) => ribbon(route(i), STROKE.route));
    const routeMat = material(forest);
    const routeMesh = add(new Mesh(routes[0], routeMat));

    const rings = PROVIDERS.map((p) => {
      const backing = add(new Mesh(new CircleGeometry(MARKER.ring, 48), material(paper)));
      backing.position.set(p[0], p[1], 0);
      const ringMat = material(lineStrong.clone());
      const ring = add(new Mesh(new RingGeometry(MARKER.ring - STROKE.ring / 2, MARKER.ring + STROKE.ring / 2, 64), ringMat));
      ring.position.set(p[0], p[1], 0);
      return { ring, ringMat };
    });

    const fillMat = material(forest);
    const fill = add(new Mesh(new CircleGeometry(MARKER.fill, 48), fillMat));

    const halo = add(new Mesh(new CircleGeometry(MARKER.halo, 48), material(forest, 0.12)));
    halo.position.set(ORIGIN[0], ORIGIN[1], 0);
    const origin = add(new Mesh(new CircleGeometry(MARKER.origin, 48), material(forest)));
    origin.position.set(ORIGIN[0], ORIGIN[1], 0);

    const segments = route(0).length - 1;
    let t = POSTER_TIME;

    const draw = () => {
      const ph = phaseAt(t);
      const local = t - POSTER_TIME;
      if (routeMesh.geometry !== routes[ph.provider]) routeMesh.geometry = routes[ph.provider];
      routeMesh.geometry.setDrawRange(0, Math.round(segments * ph.draw) * 6);
      routeMat.opacity = 1 - ph.fade;

      const [px, py] = PROVIDERS[ph.provider];
      fill.position.set(px, py, 0);
      fill.scale.setScalar(Math.max(0.0001, ph.accept));
      fillMat.opacity = 1 - ph.fade;
      rings.forEach(({ ringMat }, i) => {
        const k = i === ph.provider ? ph.accept * (1 - ph.fade) : 0;
        ringMat.color.copy(lineStrong).lerp(forest, k);
      });

      halo.scale.setScalar(1 + 0.14 * Math.sin(local * 0.9));
      plane.rotation.z = Math.sin(local * 0.06) * 0.03;
      renderer.render(scene, camera);
    };

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      draw();
    };

    let last = 0;
    const loop = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      t += dt;
      draw();
    };

    let onscreen = true;
    let running = false;
    const sync = () => {
      const should = onscreen && document.visibilityState === "visible";
      if (should === running) return;
      running = should;
      last = 0;
      renderer.setAnimationLoop(should ? loop : null);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    const io = new IntersectionObserver(([entry]) => {
      onscreen = entry.isIntersecting;
      sync();
    });
    io.observe(host);
    document.addEventListener("visibilitychange", sync);

    resize();
    readyRef.current?.();
    sync();

    return () => {
      renderer.setAnimationLoop(null);
      document.removeEventListener("visibilitychange", sync);
      io.disconnect();
      ro.disconnect();
      const geometries = new Set<BufferGeometry>(routes);
      const materials = new Set<Material>();
      scene.traverse((o: Object3D) => {
        if (o instanceof Mesh) {
          geometries.add(o.geometry);
          materials.add(o.material as Material);
        }
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className={className} />;
}
