import { Footer } from "@/components/shared/footer";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { PublicHeaderWithAccount } from "@/components/shared/public-header-with-account";
import { MAIN_CONTENT_ID } from "@/components/shared/skip-link";

export default function PublicLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <>
      <PublicHeaderWithAccount />
      <OfflineBanner className="mx-auto w-full max-w-content px-4 empty:hidden sm:px-6 lg:px-8 [&>*]:mt-3" />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <Footer />
    </>
  );
}
