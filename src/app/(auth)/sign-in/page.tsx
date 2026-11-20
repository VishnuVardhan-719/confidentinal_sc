import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthHeader } from "../_components/auth-header";
import { SignInForm } from "../_components/sign-in-form";
import { SignInNotice } from "../_components/sign-in-notice";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <>
      <AuthHeader title="Sign in" lead="Use the email address and password for your SureCure Visit account." />
      <Suspense fallback={null}>
        <SignInNotice />
      </Suspense>
      <SignInForm />
      <p className="mt-10 text-[0.9375rem]">
        New to SureCure Visit?{" "}
        <Link href="/sign-up" className="font-semibold">
          Create an account
        </Link>
      </p>
    </>
  );
}
