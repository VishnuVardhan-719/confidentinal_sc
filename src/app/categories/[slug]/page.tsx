import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/button-link";
import { EmptyState } from "@/components/ui/states";
import { categories, getCategory } from "../data";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return categories.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategory(slug);
  return category ? { title: category.name, description: category.summary } : { title: "Service not found" };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();

  return (
    <div className="container page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link href="/categories">Services</Link>
          </li>
          <li>
            <span aria-current="page">{category.name}</span>
          </li>
        </ol>
      </nav>
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
    </div>
  );
}
