import { Suspense } from "react";
import { CaretakerFrame } from "@/components/caretaker/caretaker-frame";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function CaretakerLayout({ children }: LayoutProps<"/[locale]/caretaker">) {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <CaretakerFrame>{children}</CaretakerFrame>
    </Suspense>
  );
}