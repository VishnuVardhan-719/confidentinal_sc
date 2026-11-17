import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ButtonLink } from "@/components/button-link";
import { EmptyState, Loading } from "@/components/ui/states";
import { DemoBadge } from "../_components/demo-badge";
import { cardsForCategory } from "../_components/demo-providers";
import { ProviderBrowser } from "../_components/provider-browser";
import { categories, getCategory } from "../data";

type Params = Promise<{ slug: string }>;

const NOUN = { doctor: "doctor", lab: "lab", "scheduled-ambulance": "transport provider", caretaker: "caretaker" } as const;

export function generateStaticParams() {
  return categories.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategory(slug);
  return category ? { title: category.name, description: category.summary } : { title: "Service not found" };
}

/*
 * The page shell renders without reading params, so navigation can show it instantly.
 * The four known slugs are still fully prerendered by generateStaticParams; the fallback
 * only shows while a client navigation resolves the params.
 */
export default function CategoryPage({ params }: { params: Params }) {
  return (
    <div className="frame page">
      <Suspense fallback={<CategoryFallback />}>
        <CategoryContent params={params} />
      </Suspense>
    </div>
  );
}

function Breadcrumb({ current }: { current?: string }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li>
          <Link href="/categories">Services</Link>
        </li>
        {current ? (
          <li>
            <span aria-current="page">{current}</span>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}

function CategoryFallback() {
  return (
    <>
      <Breadcrumb />
      <Loading label="Loading service" />
    </>
  );
}

async function CategoryContent({ params }: { params: Params }) {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();
  const cards = cardsForCategory(category.slug);
  const noun = NOUN[category.slug];

  return (
    <>
      <Breadcrumb current={category.name} />
      <article className="prose">
        <h1>{category.name}</h1>
        <p className="lead">{category.intro}</p>

        <h2>What it is for</h2>
        <ul>
          {category.helps.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>

        <h2>Good to know</h2>
        <ul>
          {category.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>

      </article>

      <section className="mt-16 border-t border-[var(--line)] pt-12" aria-labelledby="demo-providers-title">
        <div className="mb-8 grid max-w-[46rem] gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h2 id="demo-providers-title">Demo providers</h2>
            <DemoBadge />
          </div>
          <p className="text-[var(--ink-soft)]">
            These are made-up providers so you can try the flow. Real booking is not open yet, and no payment is
            collected.
          </p>
        </div>
        {cards.length === 0 ? (
          <EmptyState
            title={`No demo ${noun}s yet`}
            message="Demo profiles for this service have not been added. You can still read how requests will work."
            action={
              <ButtonLink href="/how-it-works" variant="secondary">
                See how it will work
              </ButtonLink>
            }
          />
        ) : (
          <ProviderBrowser cards={cards} noun={noun} />
        )}
      </section>
    </>
  );
}
