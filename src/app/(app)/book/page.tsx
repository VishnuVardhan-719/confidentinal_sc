import type { Metadata } from "next";
import { bookNextPath } from "@/components/app/access";
import { requireDemoRole } from "@/components/app/require-role";
import { BookScreen } from "@/components/app/screens";

export const metadata: Metadata = { title: "Request a visit" };

export default async function BookPage({ searchParams }: PageProps<"/book">) {
  // Keep a provider-profile link (?provider=&service=&slot=) through sign-in.
  const session = await requireDemoRole("/book", bookNextPath(await searchParams));
  return <BookScreen patientName={session.name} />;
}