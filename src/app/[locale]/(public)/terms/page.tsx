import { LegalDocument } from "@/components/public/legal-document";
import { publicPageMetadata } from "@/components/public/metadata";

export function generateMetadata() {
  return publicPageMetadata("terms", "/terms");
}

export default function TermsPage() {
  return <LegalDocument doc="terms" />;
}
