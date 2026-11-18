"use client";

import { Building2, ChevronDown } from "lucide-react";
import { useState, useTransition } from "react";
import { InlineError } from "@/components/shared/inline-error";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/modules/admin/action-result";

export type WorkspaceOption = { key: string; name: string };

/**
 * Organization switcher. Switching asks the server to validate the membership,
 * then refetches everything: data from the previous organization is never kept
 * or combined.
 */
export function WorkspaceSwitcher({
  options,
  currentKey,
  labels,
  onSwitch,
}: {
  options: WorkspaceOption[];
  currentKey: string;
  labels: { switch: string; heading: string };
  onSwitch: (key: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const current = options.find((o) => o.key === currentKey);
  if (options.length < 2) return null;

  async function choose(key: string) {
    if (key === currentKey) return;
    setError(null);
    const result = await onSwitch(key);
    if (!result.ok) {
      setError(result.code);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="grid gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" aria-busy={pending} aria-label={`${labels.switch}: ${current?.name ?? ""}`}>
            <Building2 aria-hidden />
            <span className="max-w-40 truncate">{current?.name}</span>
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{labels.heading}</DropdownMenuLabel>
          {options.map((o) => (
            <DropdownMenuItem key={o.key} onSelect={() => void choose(o.key)} aria-current={o.key === currentKey ? "true" : undefined}>
              {o.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? <InlineError code={error} /> : null}
    </div>
  );
}

/** Full-page chooser shown when several organizations exist and none is selected. */
export function WorkspaceChooser({
  options,
  labels,
  onSwitch,
}: {
  options: WorkspaceOption[];
  labels: { title: string; body: string; open: string };
  onSwitch: (key: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <section aria-labelledby="ws-choose-title" className="grid max-w-2xl gap-5">
      <h1 id="ws-choose-title" className="font-display text-3xl font-medium text-ink">
        {labels.title}
      </h1>
      <p className="measure text-lg text-muted">{labels.body}</p>
      <ul className="grid gap-3">
        {options.map((o) => (
          <li key={o.key}>
            <Button
              variant="secondary"
              className="w-full justify-start"
              disabled={pending}
              aria-label={`${labels.open} ${o.name}`}
              onClick={async () => {
                setError(null);
                const result = await onSwitch(o.key);
                if (result.ok) startTransition(() => router.refresh());
                else setError(result.code);
              }}
            >
              <Building2 aria-hidden />
              {o.name}
            </Button>
          </li>
        ))}
      </ul>
      {error ? <InlineError code={error} /> : null}
    </section>
  );
}
