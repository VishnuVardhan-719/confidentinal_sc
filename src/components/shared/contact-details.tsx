import { Mail, MapPin, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { CONTACT, CONTACT_ADDRESS_LINE } from "@/components/public/contact";
import { cn } from "@/components/ui/cn";

export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Phone, email, office address and Instagram. `tone="paper"` is for the dark footer. Link text is the
 * visible value itself, so the accessible name always starts with what people can see.
 */
export function ContactDetails({ tone = "ink", className }: { tone?: "ink" | "paper"; className?: string }) {
  const t = useTranslations("common.footer.contact");
  const paper = tone === "paper";
  const link = cn(
    "inline-flex min-h-target items-center gap-2.5 underline-offset-4 hover:underline",
    paper ? "text-on-forest-muted hover:text-on-forest focus-visible:outline-paper" : "text-ink hover:text-forest",
  );
  const icon = cn("size-4.5 shrink-0", paper ? "text-on-forest-muted" : "text-forest");
  return (
    <address className={cn("grid gap-0.5 not-italic", className)}>
      <a href={`tel:${CONTACT.phoneTel}`} className={link} aria-label={`${CONTACT.phoneDisplay}, ${t("phone")}`}>
        <Phone aria-hidden className={icon} />
        {CONTACT.phoneDisplay}
      </a>
      <a href={`mailto:${CONTACT.email}`} className={link} aria-label={`${CONTACT.email}, ${t("email")}`}>
        <Mail aria-hidden className={icon} />
        {CONTACT.email}
      </a>
      <a href={CONTACT.instagramUrl} target="_blank" rel="noopener noreferrer" className={link} aria-label={`${CONTACT.instagramHandle}, ${t("instagram")}`}>
        <InstagramIcon className={icon} />
        {CONTACT.instagramHandle}
      </a>
      <p className={cn("mt-1 flex items-start gap-2.5 py-1.5 text-base", paper ? "text-on-forest-muted" : "text-ink")}>
        <MapPin aria-hidden className={cn(icon, "mt-0.5")} />
        <span>
          <span className="sr-only">{t("office")}: </span>
          {CONTACT_ADDRESS_LINE}
        </span>
      </p>
    </address>
  );
}
