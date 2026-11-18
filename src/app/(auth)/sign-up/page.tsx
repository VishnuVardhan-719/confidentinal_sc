import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Loading } from "@/components/ui/states";
import { isDemoMode } from "@/lib/demo/auth-core";
import { parseSignupRole } from "@/lib/validation/auth-signup";
import { AuthHeader } from "../_components/auth-header";
import { DemoBadge } from "../_components/demo-panel";
import { SignUpForm } from "../_components/sign-up-form";

export const metadata: Metadata = { title: "Create an account" };

type Search = Promise<Record<string, string | string[] | undefined>>;

/** Reads `?role=` (landing-page links such as /sign-up?role=doctor). Unknown or "admin" values are ignored. */
async function SignUpBody({ searchParams }: { searchParams: Search }) {
  const { role } = await searchParams;
  return <SignUpForm initialRole={parseSignupRole(role)} demo={isDemoMode()} />;
}

export default function SignUpPage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <AuthHeader
        title="Create an account"
        lead="Tell us how you will use SureCure Visit. You can browse services without an account."
      />
      {isDemoMode() ? (
        <p className="-mt-6 mb-8 flex flex-wrap items-center gap-2 text-[0.9375rem] text-[var(--ink-soft)]">
          <DemoBadge /> Accounts made here are demo accounts in this browser only.
        </p>
      ) : null}
      <Suspense fallback={<Loading label="Loading the form" />}>
        <SignUpBody searchParams={searchParams} />
      </Suspense>
      <p className="mt-10 text-[0.9375rem]">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-semibold">
          Sign in
        </Link>
      </p>
    </>
  );
}
