import { ServiceIcon, type ServiceIconName } from "@/components/shared/service-icon";
import { House } from "lucide-react";

/**
 * Decorative geometry for the hero: four service routes converging on one home inside a coverage
 * radius. Pure SVG/CSS (no images of people, no data). Routes draw in once; static with reduced
 * motion or when CSS animations are unavailable.
 */
const NODES: { icon: ServiceIconName; x: number; y: number; d: string }[] = [
  { icon: "stethoscope", x: 70, y: 70, d: "M98 98 C150 120, 170 190, 232 238" },
  { icon: "flask", x: 410, y: 92, d: "M410 120 C380 170, 330 200, 270 236" },
  { icon: "ambulance", x: 48, y: 352, d: "M90 360 C150 340, 190 300, 232 272" },
  { icon: "care", x: 392, y: 380, d: "M392 380 C350 340, 310 310, 272 274" },
];

export function HeroArt({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className}>
      <div className="relative aspect-[1/1] w-full overflow-hidden rounded-lg bg-mist">
        <svg viewBox="0 0 500 500" className="absolute inset-0 size-full" fill="none">
          {/* Street-like contours: the neighbourhood the coverage radius sits in. */}
          <g className="stroke-forest/10" strokeWidth="14" strokeLinecap="round">
            <path d="M-20 150 C120 130, 260 190, 520 120" />
            <path d="M-20 420 C140 380, 300 440, 520 360" />
            <path d="M160 -20 C190 140, 140 330, 210 520" />
            <path d="M380 -20 C350 160, 420 300, 360 520" />
          </g>
          <circle cx="252" cy="256" r="150" className="stroke-teal" strokeWidth="1.5" strokeDasharray="4 8" />
          <circle cx="252" cy="256" r="150" className="fill-surface/35" />
          <g className="stroke-forest" strokeWidth="2.5" strokeLinecap="round">
            {NODES.map((n) => (
              <path key={n.icon} d={n.d} pathLength={1} className="scv-draw" />
            ))}
          </g>
          <circle cx="252" cy="256" r="34" className="fill-forest" />
          <circle cx="252" cy="256" r="46" className="stroke-forest/30" strokeWidth="1.5" />
        </svg>
        <House className="absolute top-1/2 left-1/2 size-[7%] -translate-1/2 text-paper" strokeWidth={2} style={{ top: "51.2%", left: "50.4%" }} />
        {NODES.map((n) => (
          <span
            key={n.icon}
            className="absolute inline-flex size-[13%] -translate-1/2 items-center justify-center rounded-md bg-surface shadow-raised"
            style={{ left: `${(n.x / 500) * 100}%`, top: `${(n.y / 500) * 100}%` }}
          >
            <ServiceIcon name={n.icon} className="size-1/2 text-forest" />
          </span>
        ))}
      </div>
    </div>
  );
}
