import { Suspense, type ReactNode } from "react";
import { getDemoSession } from "@/lib/demo/auth";
import { AppNav } from "./app-nav";
import { Icon } from "./icons";

/**
 * Signed-in app frame. The root layout already provides <main id="main-content"> and the site skip link,
 * so this renders inside it: a second skip link jumps past the app nav straight to the page content.
 * The nav reads the demo session (a cookie), so it streams in behind a Suspense boundary.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div data-app-shell className="frame flex flex-col md:grid md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10">
      <a className="skip-link" href="#app-content">
        Skip to page content
      </a>
      <Suspense fallback={<AppNav role={null} />}>
        <SessionNav />
      </Suspense>
      <div id="app-content" tabIndex={-1} className="min-w-0 pt-6 pb-12 outline-none md:pt-10 md:pb-20">
        <DemoNotice />
        {children}
      </div>
    </div>
  );
}

async function SessionNav() {
  const session = await getDemoSession();
  return <AppNav role={session?.role ?? null} name={session?.name} />;
}

function DemoNotice() {
  return (
    <p className="mb-8 flex max-w-[46rem] items-start gap-3 rounded-md bg-[var(--mist)] px-4 py-3 text-[0.9375rem] text-[var(--ink)]">
      <Icon name="info" className="mt-0.5 size-5 flex-none text-[var(--forest)]" />
      <span>
        <strong className="font-semibold">Demo.</strong> These screens use made-up people, providers and prices.
        Nothing you do here leaves this browser tab, and no payment is collected.
      </span>
    </p>
  );
}
