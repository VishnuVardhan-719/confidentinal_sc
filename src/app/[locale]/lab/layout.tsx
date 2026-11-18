import { Suspense } from "react";
import { LabFrame } from "@/components/lab/lab-frame";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function LabLayout({ children }: LayoutProps<"/[locale]/lab">) {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <LabFrame>{children}</LabFrame>
    </Suspense>
  );
}