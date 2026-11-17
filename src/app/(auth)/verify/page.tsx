import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeader } from "../_components/auth-header";
import { VerifyForm } from "../_components/verify-form";

export const metadata: Metadata = { title: "Enter your code" };

export default function VerifyPage() {
  return (
    <>
      <AuthHeader title="Enter your code" lead="Type or paste the 6-digit code sent to your mobile number." />
      {/* Empty state: sign-in is not connected, so no code has ever been sent. Say so rather than imply one is on its way. */}
      <div className="mb-8 rounded-md border border-dashed border-[var(--line-strong)] px-5 py-4">
        <p className="font-semibold">No code has been sent</p>
        <p className="mt-1 text-[0.9375rem] text-[var(--ink-soft)]">
          Codes are not sent yet because sign-in is not connected. This page shows how entering one will work.
        </p>
      </div>
      <VerifyForm />
      <p className="mt-10 text-[0.9375rem]">
        Wrong number?{" "}
        <Link href="/sign-in" className="font-semibold">
          Use a different number
        </Link>
      </p>
    </>
  );
}
