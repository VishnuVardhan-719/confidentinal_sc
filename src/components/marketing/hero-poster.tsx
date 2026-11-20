import {
  MARKER,
  ORIGIN,
  POSTER_H,
  POSTER_W,
  PROVIDERS,
  STROKE,
  circle,
  contours,
  project,
  pxPerUnit,
  route,
  type Vec2,
} from "./hero-geometry";

const toPath = (pts: Vec2[], close = false) =>
  pts.map((p, i) => `${i ? "L" : "M"}${project(p)[0].toFixed(1)} ${project(p)[1].toFixed(1)}`).join("") + (close ? "Z" : "");

/**
 * Static poster of the hero scene. It is the default everywhere (server render, reduced motion,
 * save-data, small screens, no WebGL) and sits under the canvas so the swap never shifts layout.
 */
export function HeroPoster({ className }: { className?: string }) {
  const k = pxPerUnit([0, 0]);
  return (
    <svg
      className={className}
      viewBox={`0 0 ${POSTER_W} ${POSTER_H.toFixed(0)}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="var(--line-strong)" strokeOpacity="0.7" strokeWidth={(STROKE.contour * k).toFixed(2)}>
        {contours().map((c, i) => (
          <path key={i} d={toPath(c, true)} />
        ))}
      </g>
      <path
        d={toPath(route(0))}
        fill="none"
        stroke="var(--forest)"
        strokeWidth={(STROKE.route * k).toFixed(2)}
        strokeLinecap="round"
      />
      {PROVIDERS.map((p, i) => (
        <g key={i}>
          <path
            d={toPath(circle(p, MARKER.ring), true)}
            fill="var(--paper)"
            stroke={i === 0 ? "var(--forest)" : "var(--line-strong)"}
            strokeWidth={(STROKE.ring * k).toFixed(2)}
          />
          {i === 0 ? <path d={toPath(circle(p, MARKER.fill), true)} fill="var(--forest)" /> : null}
        </g>
      ))}
      <path d={toPath(circle(ORIGIN, MARKER.halo), true)} fill="var(--forest)" fillOpacity="0.12" />
      <path d={toPath(circle(ORIGIN, MARKER.origin), true)} fill="var(--forest)" />
    </svg>
  );
}
