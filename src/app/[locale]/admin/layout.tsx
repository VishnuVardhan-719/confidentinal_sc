import { Suspense } from "react";
import { AdminFrame } from "@/components/admin/admin-frame";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <AdminFrame>{children}</AdminFrame>
    </Suspense>
  );
}