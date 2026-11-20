import { Suspense, type ReactNode } from "react";
import { BrandLogo } from "@/components/shared/brand-logo";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { MAIN_CONTENT_ID } from "@/components/shared/skip-link";
import { SessionLinks } from "./session-links";

/**
 * Chrome for signed-in pages outside a role workspace (/workspace/*, /account/*) and for the
 * focused onboarding flows. Deliberately minimal: no role navigation, nothing private in it.
 * `nested`: rendered inside a role shell that already owns the page `<main id="main-content">`
 * (onboarding/verification routes under /doctor, /lab, /ambulance, /caretaker, /admin), so the
 * content wrapper is a plain div: one main landmark per page (fe-int2 INT5, REQUESTS R-FE07-04).
 */
export function AccountFrame({ children, actions, nested = false }: { children: ReactNode; actions?: ReactNode; nested?: boolean }) {
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
      {nested ? (
        <div className="mx-auto w-full max-w-content flex-1 px-4 py-8 sm:px-6 md:py-12 lg:px-8">{children}</div>
      ) : (
        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="mx-auto w-full max-w-content flex-1 px-4 py-8 outline-none sm:px-6 md:py-12 lg:px-8">
          {children}
        </main>
      )}
    </>
  );
}
