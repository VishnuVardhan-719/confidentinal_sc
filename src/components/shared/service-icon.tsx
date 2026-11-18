import { Ambulance, FlaskConical, HandHeart, Stethoscope, type LucideProps } from "lucide-react";

const ICONS = { stethoscope: Stethoscope, flask: FlaskConical, ambulance: Ambulance, care: HandHeart } as const;
export type ServiceIconName = keyof typeof ICONS;

export function ServiceIcon({ name, ...props }: LucideProps & { name: ServiceIconName }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden strokeWidth={1.75} {...props} />;
}
