import { Suspense } from "react";
import { isPrelaunch } from "@/lib/launch-mode";
import { PublicHeader } from "./public-header";
import { getPublicAccount } from "./session-seam";

async function HeaderWithSession() {
  // Pre-launch has no sessions at all, so the header never asks the backend who is signed in.
  if (isPrelaunch()) return <PublicHeader account={null} />;
  const account = await getPublicAccount();
  return <PublicHeader account={account} />;
}

/**
 * Public header with the visitor's session. The session read is the only dynamic part; while it
 * streams, the static header renders with the account area reserved (no wrong-button flash).
 */
export function PublicHeaderWithAccount() {
  return (
    <Suspense fallback={<PublicHeader account={undefined} />}>
      <HeaderWithSession />
    </Suspense>
  );
}
