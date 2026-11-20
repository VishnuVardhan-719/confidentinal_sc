import type { Metadata } from "next";
import { ServiceIndex } from "@/components/service-index";
import { categories } from "./data";

export const metadata: Metadata = {
  title: "Explore services",
  description: "The four kinds of care you will be able to arrange with SureCure Visit.",
};

export default function CategoriesPage() {
  return (
    <div className="frame page">
      <header className="page-header">
        <h1>Four ways to arrange care</h1>
        <p className="lead">
          Read what each service is for. Online booking is not open yet, so this site is for information only.
        </p>
      </header>
      <ServiceIndex items={categories} headingLevel="h2" />
    </div>
  );
}
