import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import type { Messages } from "next-intl";
import { pageMetadata } from "./seo";

export type PublicMetaKey = keyof Messages["public"]["meta"];

/** Localized title/description + canonical/hreflang for a public page. */
export async function publicPageMetadata(key: PublicMetaKey, path: string): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("public.meta");
  const title = t(`${key}.title`);
  const meta = pageMetadata({ locale, path, title, description: t(`${key}.description`) });
  // The landing page title is already complete; skip the "%s · SureCure Visit" template.
  return path === "/" ? { ...meta, title: { absolute: title } } : meta;
}
