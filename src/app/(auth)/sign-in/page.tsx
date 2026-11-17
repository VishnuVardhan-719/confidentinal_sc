import type { Metadata } from "next";
import Link from "next/link";
import { isDemoMode } from "@/lib/demo/auth-core";
import { AuthHeader } from "../_components/auth-header";
import { DemoPanel } from "../_components/demo-panel";
import { SignInForm } from "../_components/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <>
      <AuthHeader title="Sign in" lead="Use your mobile number for a one-time code, or your email and password." />
      <SignInForm />
      <p className="mt-10 text-[0.9375rem]">
        New to SureCure Visit?{" "}
        <Link href="/sign-up" className="font-semibold">
          Create an account
        </Link>
      </p>
      {isDemoMode() ? <DemoPanel /> : null}
    </>
  );
}
