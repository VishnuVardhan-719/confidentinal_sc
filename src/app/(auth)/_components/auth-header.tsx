import type { ReactNode } from "react";

export function AuthHeader({ title, lead }: { title: string; lead: ReactNode }) {
  return (
    <header className="mb-10 flex flex-col gap-4">
      <h1 className="text-[clamp(2.375rem,5vw,3.5rem)] leading-[1.05]">{title}</h1>
      <p className="max-w-[34rem] text-[1.125rem] leading-relaxed text-[var(--ink-soft)]">{lead}</p>
    </header>
  );
}
