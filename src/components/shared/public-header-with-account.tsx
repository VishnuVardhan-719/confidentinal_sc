import { Suspense } from "react";
import { PublicHeader } from "./public-header";
import { getPublicAccount } from "./session-seam";

async function HeaderWithSession() {
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
