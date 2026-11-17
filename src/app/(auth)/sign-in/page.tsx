import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Loading } from "@/components/ui/states";
import { canAccess, DEMO_ROLE_LABEL, getDemoSession, isDemoMode, safeNext } from "@/lib/demo/auth";
import { AuthHeader } from "../_components/auth-header";
import { DemoBadge, DemoPanel } from "../_components/demo-panel";
import { SignInForm } from "../_components/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

type Search = Promise<Record<string, string | string[] | undefined>>;

/** Who is using the demo right now, and why they were sent here (a `?next=` page that needs another role). */
async function SessionNotice({ next }: { next: string | null }) {
  const session = await getDemoSession();
  if (!session) {
    return next ? (
      <p role="status" className="mb-8 border-l border-[var(--forest)] pl-4 text-[0.9375rem]">
        Sign in to continue to <code className="font-semibold">{next}</code>.
      </p>
    ) : null;
  }
  const blocked = next !== null && !canAccess(session.role, next);
  return (
    <div role="status" className="mb-8 flex flex-col gap-2 border-y border-[var(--line)] py-4 text-[0.9375rem]">
      <p className="flex flex-wrap items-center gap-2">
        <span>
          You are using the demo as <strong>{DEMO_ROLE_LABEL[session.role]}</strong> ({session.name}).
        </span>
        <DemoBadge />
      </p>
      {blocked ? (
        <p className="font-semibold text-[var(--warning)]">
          {next} needs a different demo role. Pick one below, or go back to your own dashboard.
        </p>
      ) : null}
      <p className="flex flex-wrap gap-x-5">
        <Link href={session.home} className="text-link font-semibold">
          Go to your dashboard
        </Link>
        <Link href="/sign-out" className="text-link">
          Sign out
        </Link>
      </p>
    </div>
  );
}

async function SignInBody({ searchParams }: { searchParams: Search }) {
  const { next: raw } = await searchParams;
  const next = safeNext(Array.isArray(raw) ? raw[0] : raw);
  const demo = isDemoMode();
  return (
    <>
      {demo ? <SessionNotice next={next} /> : null}
      <SignInForm />
      <p className="mt-10 text-[0.9375rem]">
        New to SureCure Visit?{" "}
        <Link href="/sign-up" className="font-semibold">
          Create an account
        </Link>
      </p>
      {demo ? <DemoPanel next={next} /> : null}
    </>
  );
}

export default function SignInPage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <AuthHeader title="Sign in" lead="Use your mobile number for a one-time code, or your email and password." />
      <Suspense fallback={<Loading label="Loading sign-in" />}>
        <SignInBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}
