import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeader } from "../_components/auth-header";
import { ForgotPasswordForm } from "../_components/forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeader
        title="Reset your password"
        lead="Password reset by email is not connected yet. This page shows how it will work."
      />
      <ForgotPasswordForm />
      <p className="mt-10 text-[0.9375rem]">
        Remembered it?{" "}
        <Link href="/sign-in" className="font-semibold">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
