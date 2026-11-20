"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { homeFor } from "@/components/app/access";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/states";
import { signOut, useAccount } from "@/lib/client/account";

/** Shows who is signed in and ends the session (POST /api/auth/logout, then the tokens are dropped). */
export function SignOutPanel() {
  const state = useAccount();
  const [pending, start] = useTransition();
  const [ended, setEnded] = useState(false);

  if (state.status === "unknown" || state.status === "loading") return <Loading label="Checking your session" />;

  if (state.status !== "signedIn") {
    return (
      <div role="status" className="rounded-md border border-dashed border-[var(--line-strong)] px-5 py-4">
        <p className="font-semibold">You are signed out</p>
        <p className="mt-1 text-[0.9375rem] text-[var(--ink-soft)]">
          {ended ? "Your session has ended in this tab. " : "There is no session in this browser tab. "}
          <Link href="/sign-in" className="font-semibold">
            Go to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <dl className="border-t border-[var(--ink)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] py-3">
          <dt className="text-[0.9375rem] font-bold">Signed in as</dt>
          <dd className="m-0 text-[var(--ink-soft)]">{state.account.name}</dd>
        </div>
      </dl>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <Button
          className="w-full sm:w-auto"
          loading={pending}
          onClick={() =>
            start(async () => {
              await signOut();
              setEnded(true);
            })
          }
        >
          Sign out
        </Button>
        <Link href={homeFor(state.account.roles)} className="text-link text-[0.9375rem]">
          Back to your area
        </Link>
      </div>
    </div>
  );
}
