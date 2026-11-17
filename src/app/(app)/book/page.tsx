import type { Metadata } from "next";
import { BookingFlow } from "@/components/app/booking-flow";
import { AppPageHeader } from "@/components/app/page-parts";

export const metadata: Metadata = { title: "Request a visit" };

export default function BookPage() {
  return (
    <>
      <AppPageHeader
        title="Request a visit"
        lead="Tell us what you need. Choosing a provider and seeing their price comes after this, once booking opens."
      />
      <BookingFlow />
    </>
  );
}
