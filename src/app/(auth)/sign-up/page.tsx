import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeader } from "../_components/auth-header";
import { SignUpForm } from "../_components/sign-up-form";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <>
      <AuthHeader
        title="Create an account"
        lead="Tell us how you will use SureCure Visit. You can browse services without an account."
      />
      <SignUpForm />
      <p className="mt-10 text-[0.9375rem]">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-semibold">
          Sign in
        </Link>
      </p>
    </>
  );
}
