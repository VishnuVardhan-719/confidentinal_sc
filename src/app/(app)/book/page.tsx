import type { Metadata } from "next";
import { Suspense } from "react";
import { BookingFlow } from "@/components/app/booking-flow";
import { AppPageHeader } from "@/components/app/page-parts";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Request a visit" };

export default function BookPage() {
  return (
    <>
      <AppPageHeader
        title="Request a visit"
        lead="Choose the care you need, a provider and a time. The provider accepts or declines your request."
      />
      {/* The flow reads ?provider=&service=&slot= from the URL, which is only known in the browser. */}
      <Suspense fallback={<FlowSkeleton />}>
        <BookingFlow />
      </Suspense>
    </>
  );
}

function FlowSkeleton() {
  return (
    <div className="max-w-[46rem]">
      <p role="status" className="visually-hidden">
        Loading the request form
      </p>
      <Skeleton className="h-11 w-full" />
      <Skeleton className="mt-8 h-8 w-2/3" />
      <Skeleton className="mt-6 h-20 w-full" />
      <Skeleton className="mt-2 h-20 w-full" />
    </div>
  );
}
