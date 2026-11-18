import { LegalDocument } from "@/components/public/legal-document";
import { publicPageMetadata } from "@/components/public/metadata";

export function generateMetadata() {
  return publicPageMetadata("privacy", "/privacy");
}

export default function PrivacyPage() {
  return <LegalDocument doc="privacy" />;
}
