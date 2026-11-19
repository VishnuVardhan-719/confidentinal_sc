"use client";

import { ServiceRouteError } from "@/components/service-requests/route-error";

export default function RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ServiceRouteError area="book" error={error} retry={retry} />;
}
