import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthContext } from "./_components/auth-context";

// Account pages carry nothing worth indexing.
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="frame grid gap-14 pt-10 pb-16 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:gap-12 md:pt-16 md:pb-24 lg:gap-16">
      <div className="min-w-0 md:max-w-[34rem]">{children}</div>
      <AuthContext />
    </div>
  );
}
