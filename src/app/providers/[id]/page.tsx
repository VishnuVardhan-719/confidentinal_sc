import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/ui/states";
import { DemoBadge } from "@/app/categories/_components/demo-badge";
import {
  allProviderIds,
  categoryForProvider,
  providerById,
  slotDays,
} from "@/app/categories/_components/demo-providers";
import { SlotPicker } from "@/app/categories/_components/slot-picker";

type Params = Promise<{ id: string }>;

export function generateStaticParams() {
  return allProviderIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const p = providerById(id);
  return p
    ? { title: `${p.name} (demo profile)`, description: `${p.speciality}, ${p.city}. Synthetic demo profile, not a real provider.`, robots: { index: false } }
    : { title: "Provider not found" };
}

/** Shell renders without params so navigation is instant; the profile streams in (prerendered for known ids). */
export default function ProviderPage({ params }: { params: Params }) {
  return (
    <div className="frame page">
      <Suspense fallback={<Loading label="Loading demo profile" />}>
        <ProviderContent params={params} />
      </Suspense>
    </div>
  );
}

async function ProviderContent({ params }: { params: Params }) {
  const { id } = await params;
  const provider = providerById(id);
  if (!provider) notFound();
  const category = categoryForProvider(provider);
  const days = slotDays(provider.slots);
  const facts = [
    provider.speciality,
    provider.city,
    provider.experienceYears ? `${provider.experienceYears} years' experience (demo)` : null,
  ].filter(Boolean);

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link href="/categories">Services</Link>
          </li>
          {category ? (
            <li>
              <Link href={`/categories/${category.slug}`}>{category.name}</Link>
            </li>
          ) : null}
          <li>
            <span aria-current="page">{provider.name}</span>
          </li>
        </ol>
      </nav>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-20">
        <header className="grid content-start gap-5">
          <DemoBadge className="justify-self-start" />
          <h1 className="text-[clamp(2.25rem,5vw,4rem)]">{provider.name}</h1>
          <p className="text-lg text-[var(--ink)]">{facts.join(" · ")}</p>
          <dl className="m-0 grid gap-4 border-t border-[var(--line)] pt-5">
            <div>
              <dt className="text-sm font-semibold">Languages</dt>
              <dd className="m-0 text-[var(--ink-soft)]">{provider.languages.join(", ")}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold">Payment</dt>
              <dd className="m-0 text-[var(--ink-soft)]">Not collected. Prices shown are demo prices.</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold">How requests work</dt>
              <dd className="m-0 text-[var(--ink-soft)]">
                You send a request; the provider accepts or declines. Nothing is confirmed until they accept.
              </dd>
            </div>
          </dl>
          {provider.kind === "ambulance" ? (
            <p className="notice">
              Scheduled, non-emergency transport only. In an emergency in India, call <a href="tel:112">112</a>.
            </p>
          ) : null}
          <p className="text-[0.9375rem] text-[var(--ink-soft)]">
            This profile is synthetic. It does not describe a real person or business, and nothing on it has been
            verified.
          </p>
        </header>

        <section aria-label="Choose a service and time">
          <SlotPicker
            providerId={provider.id}
            services={provider.services.map((s) => ({ ...s }))}
            days={days}
          />
        </section>
      </div>
    </>
  );
}
