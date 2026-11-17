import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="container page">
      <header className="page-header">
        <h1>Page not found</h1>
        <p className="lead">The address may be mistyped, or the page may have moved.</p>
      </header>
      <div className="max-w-[46rem]">
        <EmptyState
          title="Nothing at this address"
          message="Start from the home page or browse the services."
          action={
            <div className="actions justify-center">
              <ButtonLink href="/">Go to the home page</ButtonLink>
              <Link className="text-link" href="/categories">Explore services</Link>
            </div>
          }
        />
      </div>
    </div>
  );
}
