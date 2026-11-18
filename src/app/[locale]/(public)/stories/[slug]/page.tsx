import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getPublishedStory } from "@/components/public/stories-source";

/** Only approved, published stories render. Nothing is published yet, so every slug is not-found. */
export function generateStaticParams() {
  // Cache Components requires one sample param; it resolves to not-found like any unknown slug.
  return [{ slug: "__unpublished__" }];
}

export default async function StoryPage({ params }: PageProps<"/[locale]/stories/[slug]">) {
  const { slug } = await params;
  const story = await getPublishedStory(await getLocale(), slug);
  if (!story) notFound();
  // Rendering for published stories lands with the content module (docs/frontend/REQUESTS.md).
  notFound();
}
