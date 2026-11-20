"use client";

import { PublicRouteError } from "@/components/shared/public-route-error";

export default function PublicError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <PublicRouteError {...props} />;
}
