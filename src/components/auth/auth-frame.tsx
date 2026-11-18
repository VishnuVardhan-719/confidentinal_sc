import type { ReactNode } from "react";
import { Container } from "@/components/public/layout";

/** Two-column frame for auth pages: the form, and an optional explanatory aside. */
export function AuthFrame({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <Container className="grid gap-10 py-10 md:py-16 lg:grid-cols-12 lg:gap-12">
      <div className="grid content-start gap-8 lg:col-span-7 xl:col-span-6">{children}</div>
      {aside ? <aside className="grid content-start gap-6 lg:col-span-5 lg:col-start-8 xl:col-start-8">{aside}</aside> : null}
    </Container>
  );
}

export function AuthHeading({ title, lead }: { title: string; lead?: ReactNode }) {
  return (
    <div className="grid gap-3">
      <h1 className="font-display text-3xl font-medium tracking-[-0.02em] text-ink">{title}</h1>
      {lead ? <p className="measure text-lg text-muted">{lead}</p> : null}
    </div>
  );
}
