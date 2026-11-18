import { LegalDocument } from "@/components/public/legal-document";
import { publicPageMetadata } from "@/components/public/metadata";

export function generateMetadata() {
  return publicPageMetadata("refunds", "/refunds");
}

export default function RefundsPage() {
  return <LegalDocument doc="refunds" />;
}
