import type { Metadata } from "next";
import { AuthHeader } from "../_components/auth-header";
import { SignOutPanel } from "../_components/sign-out-panel";

export const metadata: Metadata = { title: "Sign out" };

export default function SignOutPage() {
  return (
    <>
      <AuthHeader title="Sign out" lead="Signing out ends your session and removes it from this browser tab." />
      <SignOutPanel />
    </>
  );
}
