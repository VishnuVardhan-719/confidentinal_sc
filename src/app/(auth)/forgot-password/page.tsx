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
        lead="Enter your email address and a link to set a new password will be sent there."
      />
      <ForgotPasswordForm />
      <p className="mt-10 text-[0.9375rem]">
        Sign in with your mobile number? You have no password to reset.{" "}
        <Link href="/sign-in" className="font-semibold">
          Sign in with a code
        </Link>
      </p>
    </>
  );
}
