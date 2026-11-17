import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { endDemoSession } from "@/lib/demo/auth-actions";
import { DEMO_ROLE_LABEL, getDemoSession } from "@/lib/demo/auth";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/states";
import { AuthHeader } from "../_components/auth-header";
import { DemoBadge } from "../_components/demo-panel";

export const metadata: Metadata = { title: "Sign out" };

async function SessionState() {
  const session = await getDemoSession();

  if (!session) {
    return (
      <div className="rounded-md border border-dashed border-[var(--line-strong)] px-5 py-4">
        <p className="font-semibold">You are signed out</p>
        <p className="mt-1 text-[0.9375rem] text-[var(--ink-soft)]">
          There is no demo session in this browser.{" "}
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
          <dt className="text-[0.9375rem] font-bold">Demo role</dt>
          <dd className="m-0 flex flex-wrap items-center gap-2">
            {DEMO_ROLE_LABEL[session.role]} <DemoBadge />
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] py-3">
          <dt className="text-[0.9375rem] font-bold">Shown as</dt>
          <dd className="m-0 text-[var(--ink-soft)]">{session.name}</dd>
        </div>
      </dl>
      <form action={endDemoSession} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <Button type="submit" className="w-full sm:w-auto">
          End demo session
        </Button>
        <Link href={session.home} className="text-link text-[0.9375rem]">
          Back to the demo
        </Link>
      </form>
    </div>
  );
}

export default function SignOutPage() {
  return (
    <>
      <AuthHeader title="Sign out" lead="Ending a demo session clears the demo role from this browser." />
      <Suspense fallback={<Loading label="Checking your session" />}>
        <SessionState />
      </Suspense>
    </>
  );
}
