"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { ButtonLink } from "@/components/button-link";
import { ErrorState, Loading } from "@/components/ui/states";
import { errorMessage } from "@/lib/client/api";
import { loadAccount, useAccount, type Account } from "@/lib/client/account";
import { homeFor, mayOpen, signInUrl, type AppRoute } from "./access";
import { EmptyPanel } from "./empty-panel";

const AccountContext = createContext<Account | null>(null);

/** The signed-in account inside a SessionGate. Throws outside one, so a screen cannot render unguarded. */
export function useSignedIn(): Account {
  const account = useContext(AccountContext);
  if (!account) throw new Error("useSignedIn must be used inside <SessionGate>");
  return account;
}

/**
 * Client-side route gate for the app area. Shows a loading state while the session is checked, sends a
 * signed-out visitor to sign-in (keeping where they were going), and tells a signed-in account without the
 * right role where its own area is. This only shapes the UI; the API enforces access on every request.
 */
export function SessionGate({ route, children }: { route: AppRoute; children: ReactNode }) {
  const state = useAccount();
  const router = useRouter();
  const pathname = usePathname() ?? route;

  useEffect(() => {
    if (state.status !== "signedOut") return;
    router.replace(signInUrl(`${pathname}${window.location.search}`));
  }, [state.status, pathname, router]);

  if (state.status === "unknown" || state.status === "loading") return <Loading label="Checking your session" />;

  if (state.status === "signedOut") {
    return (
      <EmptyPanel icon="lock" tone="locked" title="Sign in to continue" headingLevel={2}>
        <p>
          This page is for signed-in accounts. Taking you to sign in now.{" "}
          <a href={signInUrl(pathname)} className="font-semibold">
            Go to sign in
          </a>
        </p>
      </EmptyPanel>
    );
  }

  if (state.status === "error") {
    return (
      <ErrorState
        title="We could not check your session"
        message={errorMessage(state.error)}
        onRetry={() => void loadAccount(true)}
      />
    );
  }

  const { account } = state;
  if (!mayOpen(account.roles, route)) {
    return (
      <EmptyPanel
        icon="lock"
        tone="locked"
        title="This area is not part of your account"
        headingLevel={2}
        actions={<ButtonLink href={homeFor(account.roles)}>Go to your area</ButtonLink>}
      >
        <p>Your account does not have access to this page. Nothing here has been shown or changed.</p>
      </EmptyPanel>
    );
  }

  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}
