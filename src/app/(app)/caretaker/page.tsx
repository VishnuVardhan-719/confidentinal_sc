import type { Metadata } from "next";
import { requireDemoRole } from "@/components/app/require-role";
import { CaretakerScreen } from "@/components/app/screens";

export const metadata: Metadata = { title: "People you support" };

export default async function CaretakerPage() {
  const session = await requireDemoRole("/caretaker");
  return <CaretakerScreen name={session.name} />;
}