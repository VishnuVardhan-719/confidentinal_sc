import type { Metadata } from "next";
import { ButtonLink } from "@/components/button-link";
import { requestSteps } from "./steps";

export const metadata: Metadata = {
  title: "How it works",
  description: "How a request is planned to work on SureCure Visit: you choose, the provider accepts.",
};

export default function HowItWorksPage() {
  return (
    <div className="container page">
      <header className="page-header">
        <h1>You choose. The provider accepts.</h1>
        <p className="lead">This is how the service is designed to work once booking opens.</p>
      </header>
      <ol className="steps">
        {requestSteps.map((s) => (
          <li key={s.title}>
            <h2>{s.title}</h2>
            <p>{s.body}</p>
          </li>
        ))}
      </ol>
      <div className="notice mt-16 max-w-[46rem]">
        <p className="notice-title">Online booking is not available yet.</p>
        <p>Nothing on this site can be booked or paid for today.</p>
        <p>
          For emergencies in India, call <a href="tel:112">112</a>.
        </p>
      </div>
      <div className="actions mt-8">
        <ButtonLink href="/categories">Explore services</ButtonLink>
      </div>
    </div>
  );
}
