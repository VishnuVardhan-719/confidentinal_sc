import type { Metadata } from "next";
import { BookScreen } from "@/components/app/screens";

export const metadata: Metadata = { title: "Request a visit" };

export default function BookPage() {
  return <BookScreen />;
}
