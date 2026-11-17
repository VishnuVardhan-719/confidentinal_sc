import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ButtonLink } from "@/components/button-link";
import { EmptyState, Loading } from "@/components/ui/states";
import { categories, getCategory } from "../data";

type Params = Promise<{ slug: string }>;

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

        <div className="mt-12">
          <EmptyState
            title="Booking is not open yet"
            message="You will be able to choose a provider here once online booking opens."
            action={
              <ButtonLink href="/how-it-works" variant="secondary">
                See how it will work
              </ButtonLink>
            }
          />
        </div>
      </article>
    </>
  );
}
