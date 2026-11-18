import { Check, CircleHelp, Clock, Dot, Lock, Pause, ShieldCheck, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_ICON_FOR_TONE, type StatusDescriptor, type StatusIcon } from "./status";

const ICONS: Record<StatusIcon, LucideIcon> = {
  dot: Dot,
  clock: Clock,
  check: Check,
  x: X,
  alert: TriangleAlert,
  pause: Pause,
  shield: ShieldCheck,
  lock: Lock,
  help: CircleHelp,
};

/** Tone + icon + text. Colour is never the only signal. Labels must already be localized. */
export function StatusBadge({ tone, label, icon, className }: StatusDescriptor & { className?: string }) {
  const Icon = ICONS[icon ?? DEFAULT_ICON_FOR_TONE[tone]];
  return (
    <Badge tone={tone} className={className}>
      <Icon aria-hidden strokeWidth={2.25} />
      {label}
    </Badge>
  );
}
