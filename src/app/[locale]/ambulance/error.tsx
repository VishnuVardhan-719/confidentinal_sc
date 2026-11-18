"use client";

import { AreaError } from "@/components/admin/ops/area-error";

export default function AmbulanceError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <AreaError {...props} />;
}