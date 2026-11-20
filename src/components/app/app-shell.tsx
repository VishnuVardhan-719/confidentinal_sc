import type { ReactNode } from "react";
import { SessionNav } from "./app-nav";

/**
 * Signed-in app frame. The root layout already provides <main id="main-content"> and the site skip link,
 * so this renders inside it: a second skip link jumps past the app nav straight to the page content.
 * The session lives in this browser tab, so the nav is a client component that fills in after hydration.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div data-app-shell className="frame flex flex-col md:grid md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10">
      <a className="skip-link" href="#app-content">
        Skip to page content
      </a>
      <SessionNav />
      <div id="app-content" tabIndex={-1} className="min-w-0 pt-6 pb-12 outline-none md:pt-10 md:pb-20">
        {children}
      </div>
    </div>
  );
}
