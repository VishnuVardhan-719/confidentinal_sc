"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { homeFor, safeNext } from "@/components/app/access";
import { useAccount } from "@/lib/client/account";

/** Above the sign-in form: who is already signed in in this tab, or where sign-in will continue to. */
export function SignInNotice() {
  const state = useAccount();
  const next = safeNext(useSearchParams()?.get("next"));

  if (state.status === "signedIn") {
    return (
      <div role="status" className="mb-8 flex flex-col gap-2 border-y border-[var(--line)] py-4 text-[0.9375rem]">
        <p>
          You are signed in as <strong>{state.account.name}</strong>.
        </p>
        <p className="flex flex-wrap gap-x-5">
          <Link href={homeFor(state.account.roles)} className="text-link font-semibold">
            Go to your area
          </Link>
          <Link href="/sign-out" className="text-link">
            Sign out
          </Link>
        </p>
      </div>
    );
  }
  if (!next) return null;
  return (
    <p role="status" className="mb-8 border-l border-[var(--forest)] pl-4 text-[0.9375rem]">
      Sign in to continue to <code className="font-semibold">{next.split("?")[0]}</code>.
    </p>
  );
}
