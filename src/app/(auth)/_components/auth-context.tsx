const facts = [
  {
    term: "Who can create an account",
    detail: "Patients and families, doctors, labs, scheduled ambulance operators and caretakers.",
  },
  {
    term: "Providers",
    detail: "A provider's details are reviewed before anyone can book them.",
  },
  {
    term: "Staff access",
    detail: "Admin accounts are invite-only. They cannot be chosen when you sign up.",
  },
] as const;

/** The quiet column beside every auth form: what these accounts are for. */
export function AuthContext() {
  return (
    <aside
      aria-labelledby="auth-context-title"
      className="border-t border-[var(--ink)] pt-8 md:sticky md:top-10 md:self-start md:border-t-0 md:border-l md:border-[var(--line)] md:pt-2 md:pl-12 lg:pl-16"
    >
      <h2 id="auth-context-title" className="max-w-[16ch] text-[clamp(1.625rem,2.6vw,2.125rem)]">
        One account for <em className="text-[var(--forest)]">your</em> requests.
      </h2>
      <p className="mt-4 max-w-[30rem] text-[var(--ink-soft)]">
        Your session stays in this browser tab and ends when you sign out or close the tab. You can browse services
        without an account.
      </p>
      <dl className="mt-8 max-w-[30rem]">
        {facts.map((f) => (
          <div key={f.term} className="border-t border-[var(--line)] py-4">
            <dt className="text-[0.9375rem] font-bold">{f.term}</dt>
            <dd className="mt-1 text-[0.9375rem] text-[var(--ink-soft)]">{f.detail}</dd>
          </div>
        ))}
        <div className="border-t border-[var(--line)] pt-4">
          <dt className="text-[0.9375rem] font-bold">In an emergency</dt>
          <dd className="mt-1 text-[0.9375rem] text-[var(--ink-soft)]">
            Call{" "}
            <a href="tel:112" className="font-bold">
              112
            </a>{" "}
            in India. You never need an account for that.
          </dd>
        </div>
      </dl>
    </aside>
  );
}
