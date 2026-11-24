import { Suspense } from "react";
import { BrandLogo } from "./brand-logo";
import { getPublicAccount } from "./session-seam";

async function Resolved({ className }: { className?: string }) {
  const account = await getPublicAccount();
  return <BrandLogo href={account?.workspaces[0]?.href ?? "/"} className={className} />;
}

/**
 * Logo for chrome that can be seen signed in or out (account frame, denied pages): signed-in
 * visitors go back to their dashboard, everyone else to the landing page. The static logo shows
 * while the session streams.
 */
export function SessionBrandLogo({ className }: { className?: string }) {
  return (
    <Suspense fallback={<BrandLogo className={className} />}>
      <Resolved className={className} />
    </Suspense>
  );
}
