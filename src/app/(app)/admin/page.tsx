import type { Metadata } from "next";
import { AppPageHeader } from "@/components/app/page-parts";
import { Icon } from "@/components/app/icons";

export const metadata: Metadata = { title: "Verification queue" };

const COLUMNS = ["Provider", "Service", "Submitted (IST)", "Documents", "Status"] as const;

export default function AdminVerificationPage() {
  return (
    <>
      <AppPageHeader
        title="Verification queue"
        lead="Provider profiles waiting for a document check. A provider is listed for patients only after approval."
      />

      <div className="rounded-md border border-[var(--line)]">
        <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-labelledby="queue-caption">
          <table className="w-full min-w-[40rem] border-collapse text-left text-[0.9375rem]">
            <caption id="queue-caption" className="visually-hidden">
              Provider profiles awaiting verification
            </caption>
            <thead className="bg-[var(--mist)]">
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c} scope="col" className="px-4 py-3 font-semibold whitespace-nowrap text-[var(--ink)]">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody />
          </table>
        </div>
        {/* Outside the scroll area so the message stays readable on narrow screens. */}
        <div className="flex flex-col items-center gap-3 border-t border-[var(--line)] px-5 py-12 text-center">
          <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-[var(--mist)] text-[var(--forest)]">
            <Icon name="queue" className="size-5" />
          </span>
          <p className="font-bold">No profiles to review</p>
          <p className="max-w-[30rem] text-[var(--ink-soft)]">
            Profiles appear here after providers submit them. Provider submission is not connected yet.
          </p>
        </div>
      </div>

      <p className="mt-6 max-w-[40rem] text-[0.9375rem] text-[var(--ink-soft)]">
        Documents will open through short-lived private links, and only for signed-in admins.
      </p>
    </>
  );
}
