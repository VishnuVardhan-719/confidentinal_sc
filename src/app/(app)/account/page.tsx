import type { Metadata } from "next";
import { AccountForm } from "@/components/app/account-form";
import { AppPageHeader } from "@/components/app/page-parts";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <>
      <AppPageHeader title="Account" lead="Your language and contact details." />
      <AccountForm />
    </>
  );
}
