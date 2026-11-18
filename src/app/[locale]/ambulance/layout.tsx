import { Suspense } from "react";
import { AmbulanceFrame } from "@/components/ambulance/ambulance-frame";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function AmbulanceLayout({ children }: LayoutProps<"/[locale]/ambulance">) {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <AmbulanceFrame>{children}</AmbulanceFrame>
    </Suspense>
  );
}