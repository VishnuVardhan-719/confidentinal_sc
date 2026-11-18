import type { Metadata } from "next";
import { SITE_URL } from "@/components/marketing/site";
import "@/components/marketing/marketing.css";

// Route group for the public information pages. The root layout already renders the header, main and footer.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
};

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
