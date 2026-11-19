import { Suspense } from "react";
import { Footer } from "@/components/shared/footer";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { PublicHeader } from "@/components/shared/public-header";
import { MAIN_CONTENT_ID } from "@/components/shared/skip-link";

/** Public frame for the proof-of-visit check (same header/footer as the public site, reused not edited). */
export default function VerifyLayout({ children }: LayoutProps<"/[locale]/verify">) {
  return (
    <>
      {/* /verify/[code] is dynamic: the header reads the pathname (locale switcher), so it streams. */}
      <Suspense fallback={<div className="h-16 border-b border-border" aria-hidden />}>
        <PublicHeader />
      </Suspense>
      <OfflineBanner className="mx-auto w-full max-w-content px-4 empty:hidden sm:px-6 lg:px-8 [&>*]:mt-3" />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </>
  );
}
