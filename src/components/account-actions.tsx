"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { homeFor } from "@/components/app/access";
import { signOut, useAccount } from "@/lib/client/account";
import { ButtonLink } from "./button-link";
import { SIGN_IN_HREF, SIGN_UP_HREF } from "./site-links";
import { Button } from "./ui/button";

export type AccountLabels = { signIn: string; createAccount: string; dashboard: string; signOut: string };

/**
 * Header account links. The session lives in this browser tab, so this is a client component: guests (and
 * the server render) get sign-in and create-account; a signed-in account gets its own area and sign out.
 */
export function AccountActions({ labels }: { labels: AccountLabels }) {
  const state = useAccount();
  const router = useRouter();
  const [pending, start] = useTransition();

  if (state.status !== "signedIn") {
    return (
      <div className="sh-actions">
        <Link className="sh-signin" href={SIGN_IN_HREF}>
          {labels.signIn}
        </Link>
        <ButtonLink href={SIGN_UP_HREF}>{labels.createAccount}</ButtonLink>
      </div>
    );
  }
  return (
    <div className="sh-actions">
      <ButtonLink href={homeFor(state.account.roles)}>{labels.dashboard}</ButtonLink>
      <Button
        variant="secondary"
        className="w-full"
        loading={pending}
        onClick={() =>
          start(async () => {
            await signOut();
            router.push("/sign-out");
          })
        }
      >
        {labels.signOut}
      </Button>
    </div>
  );
}
