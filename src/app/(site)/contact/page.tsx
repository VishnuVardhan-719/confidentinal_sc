import Link from "next/link";
import { ContactForm } from "@/components/marketing/contact-form";
import { PageIntro, RelatedPages } from "@/components/marketing/page-parts";
import { pageMetadata } from "@/components/marketing/seo";

export const metadata = pageMetadata(
  "contact",
  "Contact",
  "The SureCure Visit contact form. It is not connected yet, so messages are not sent. In an emergency in India, call 112.",
);

export default function ContactPage() {
  return (
    <div className="frame page">
      <PageIntro
        title="Contact"
        lead="A way to reach the SureCure Visit team is being set up. Until it is, here is what you can and cannot do."
      />
      <div className="grid gap-12 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:gap-16">
        <section aria-labelledby="form-title">
          <h2 id="form-title" className="mb-6">
            Write a message
          </h2>
          <ContactForm />
        </section>
        <aside className="status self-start" aria-labelledby="before-title">
          <h2 id="before-title" className="status-title">
            Before you write
          </h2>
          <dl>
            <div>
              <dt>In an emergency</dt>
              <dd>
                Call <a href="tel:112">112</a> in India. Do not use this form. SureCure Visit is not an emergency
                service.
              </dd>
            </div>
            <div>
              <dt>Reply times</dt>
              <dd>Support hours and reply times have not been set, so we do not promise either yet.</dd>
            </div>
            <div>
              <dt>Common questions</dt>
              <dd>
                Booking, prices and provider checks are answered on the <Link href="/faq">questions page</Link>.
              </dd>
            </div>
          </dl>
        </aside>
      </div>
      <RelatedPages current="contact" keys={["faq", "providers", "privacy"]} />
    </div>
  );
}
