import type { ReactNode } from "react";

/** Page title block for app screens: fixed sizes, not the fluid marketing scale. */
export function AppPageHeader({ title, lead, children }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-10 max-w-[46rem]">
      <h1 className="text-[2rem] leading-[1.15] tracking-[-0.02em] md:text-[2.5rem]">{title}</h1>
      {lead ? <p className="mt-3 max-w-[40rem] text-[1.0625rem] text-[var(--ink-soft)]">{lead}</p> : null}
      {children}
    </header>
  );
}

/** Section heading inside an app page, in the body face so labels do not use the display serif. */
export function SectionTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="font-sans text-[1.125rem] leading-snug font-bold tracking-normal">
      {children}
    </h2>
  );
}
