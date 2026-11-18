import { Check, CircleDashed, CircleHelp, Clock, Dot, Lock, Pause, ShieldCheck, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_ICON_FOR_TONE,
  toStatusDescriptor,
  type StatusDescriptor,
  type StatusIcon,
  type StatusPresentation,
  type StatusTranslator,
} from "./status";

const ICONS: Record<StatusIcon, LucideIcon> = {
  dot: Dot,
  clock: Clock,
  progress: CircleDashed,
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


/**
 * Badge straight from a module presentation ({ labelKey, tone }). Use in server components, where
 * every namespace is loaded. In client islands pass an already-resolved descriptor to <StatusBadge/>.
 */
export function KeyedStatusBadge({ presentation, className }: { presentation: StatusPresentation | null | undefined; className?: string }) {
  const t = useTranslations() as unknown as StatusTranslator;
  return <StatusBadge {...toStatusDescriptor(presentation, t)} className={className} />;
}