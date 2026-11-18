import { Suspense, type ReactNode } from "react";
import { BrandLogo } from "@/components/shared/brand-logo";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { MAIN_CONTENT_ID } from "@/components/shared/skip-link";
import { SessionLinks } from "./session-links";

/**
 * Chrome for signed-in pages outside a role workspace (/workspace/*, /account/*) and for the
 * focused onboarding flows. Deliberately minimal: no role navigation, nothing private in it.
 */
export function AccountFrame({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <>
      <header className="border-b border-border bg-paper">
        <div className="mx-auto flex min-h-16 max-w-content flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-6 lg:px-8">
          <BrandLogo />
          <div className="flex-1" />
          <LocaleSwitcher />
          {actions ?? (
            <Suspense fallback={null}>
              <SessionLinks />
            </Suspense>
          )}
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="mx-auto w-full max-w-content flex-1 px-4 py-8 outline-none sm:px-6 md:py-12 lg:px-8">
        {children}
      </main>
    </>
  );
}
