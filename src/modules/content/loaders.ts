import { operationsNow } from "@/modules/admin/clock";
import { ok } from "@/lib/api/result";
import { toLoaderResult, type AdminLoaderContext, type LoaderResult } from "@/modules/admin/access";
import {
  availableContentActions,
  editorFormFromBody,
  emptyEditorForm,
  localeMatrix,
  previewFor,
  publishBlockedKey,
  revisionRows,
  type EditorForm,
  type LocaleCellVM,
  type PreviewVM,
  type RevisionRowVM,
} from "./editor";
import { getContentApi } from "./index";
import type { Locale } from "./schema";
import type { ContentAction, ContentKind, ContentListFilter } from "./types";

/** Server-side route loaders for the admin CMS. */

const api = (ctx: AdminLoaderContext) => getContentApi({ env: ctx.env, principal: ctx.principal, now: ctx.now });

export type ContentListRowVM = { id: string; kind: ContentKind; slug: string; locales: LocaleCellVM[] };

export async function loadContentList(ctx: AdminLoaderContext, filter: ContentListFilter = {}): Promise<LoaderResult<{ rows: ContentListRowVM[]; nextCursor: string | null }>> {
  const cms = api(ctx);
  const result = await cms.listEntries(filter);
  return toLoaderResult(
    result.ok ? ok({ rows: result.data.items.map((e) => ({ id: e.id, kind: e.kind, slug: e.slug, locales: localeMatrix(e) })), nextCursor: result.data.nextCursor }) : result,
    cms.mode,
    (d) => d.rows.length === 0,
  );
}

export type ContentEditorVM = {
  id: string;
  kind: ContentKind;
  slug: string;
  locale: Locale;
  locales: LocaleCellVM[];
  /** Form prefilled from the working copy, or empty when this locale has no version yet. */
  form: EditorForm;
  /** Null for a locale without a version yet (first save creates it). */
  expectedVersion: number | null;
  actions: ContentAction[];
  /** Why publish is not offered (consent gate), for an explanatory hint. */
  publishBlockedKey: string | null;
  revisions: RevisionRowVM[];
  preview: PreviewVM | null;
};

export async function loadContentEditor(ctx: AdminLoaderContext, entryId: string, locale: Locale): Promise<LoaderResult<ContentEditorVM>> {
  const cms = api(ctx);
  const result = await cms.getEntry(entryId);
  if (!result.ok) return toLoaderResult(result, cms.mode);
  const entry = result.data;
  const version = entry.locales[locale];
  const now = ctx.now ? ctx.now() : operationsNow(ctx.env);
  return toLoaderResult(
    ok({
      id: entry.id,
      kind: entry.kind,
      slug: entry.slug,
      locale,
      locales: localeMatrix(entry),
      form: version ? editorFormFromBody(entry.slug, locale, version.working.content) : { ...emptyEditorForm(entry.kind, locale), slug: entry.slug },
      expectedVersion: version?.version ?? null,
      actions: version ? availableContentActions(ctx.principal, version.working.state, now, version.working.content) : [],
      publishBlockedKey: publishBlockedKey(version?.working.content),
      revisions: version ? revisionRows(version.history) : [],
      preview: previewFor(entry, locale),
    }),
    cms.mode,
  );
}
