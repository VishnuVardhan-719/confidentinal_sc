import { getTranslations } from "next-intl/server";
import { AdminRouteGate } from "@/components/admin/admin-frame";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { CmsEditorView, isContentLocale } from "@/components/content/cms-views";
import { loadContentEditor } from "@/modules/content/loaders";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("admin.nav"))("cms"));
}

export default async function Page({ params, searchParams }: PageProps<"/[locale]/admin/cms/[entryId]">) {
  const [{ entryId }, sp] = await Promise.all([params, searchParams]);
  return (
    <AdminRouteGate route="cms">
      {async (ctx, locale) => <CmsEditorView result={await loadContentEditor(ctx, decodeURIComponent(entryId), isContentLocale(sp.locale) ? sp.locale : locale)} />}
    </AdminRouteGate>
  );
}