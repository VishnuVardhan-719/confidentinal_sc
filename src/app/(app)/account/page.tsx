import type { Metadata } from "next";
import { requireDemoRole } from "@/components/app/require-role";
import { AccountScreen } from "@/components/app/screens";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const session = await requireDemoRole("/account");
  return <AccountScreen role={session.role} name={session.name} email={session.email} />;
}