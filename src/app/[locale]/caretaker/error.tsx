"use client";

import { AreaError } from "@/components/admin/ops/area-error";

export default function CaretakerError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <AreaError {...props} />;
}