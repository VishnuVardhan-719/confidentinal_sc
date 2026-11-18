import { useLocale, useTranslations } from "next-intl";
import { formatDateTime } from "@/components/admin/ops/format";
import { OpsAction } from "@/components/admin/ops/ops-action";
import { OpsStatus } from "@/components/admin/ops/ops-status";
import { RecordList } from "@/components/admin/ops/record-list";
import { LoaderState } from "@/components/admin/ops/states";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type { LoaderResult } from "@/modules/admin/access";
import { cmsSaveDraftAction, cmsTransitionAction } from "@/modules/admin/admin-actions";
import { emptyEditorForm } from "@/modules/content/editor";
import type { ContentEditorVM, ContentListRowVM } from "@/modules/content/loaders";
import { LOCALES, type Locale } from "@/modules/content/schema";
import type { ContentKind } from "@/modules/content/types";
import { CmsEditorForm, type CmsEditorLabels } from "./cms-editor-form";
import { RichText } from "./rich-text";

const useAppLocale = () => useLocale() as AppLocale;

function useEditorLabels(): CmsEditorLabels {
  const t = useTranslations("admin.cms");
  return {
    slug: t("fields.slug"),
    slugHint: t("fields.slugHint"),
    title: t("fields.title"),
    summary: t("fields.summary"),
    body: t("fields.body"),
    bodyHint: t("fields.bodyHint"),
    question: t("fields.question"),
    answer: t("fields.answer"),
    order: t("fields.order"),
    consentEvidence: t("fields.consentEvidence"),
    consentHint: t("fields.consentHint"),
    noIdentifiablePerson: t("fields.noIdentifiablePerson"),
    save: t("save"),
    saved: t("saved"),
    errors: {
      required: t("errors.required"),
      too_long: t("errors.too_long"),
      html_forbidden: t("errors.html_forbidden"),
      unsafe_link: t("errors.unsafe_link"),
      invalid: t("errors.invalid"),
    },
  };
}

export function CmsListView({ result, canEdit }: { result: LoaderResult<{ rows: ContentListRowVM[]; nextCursor: string | null }>; canEdit: boolean }) {
  const t = useTranslations("admin.cms");
  const tl = useTranslations("common.locales");
  const newLinks = canEdit ? (
    <>
      {(["story", "faq", "page"] as const).map((k) => (
        <Button key={k} asChild variant={k === "story" ? "primary" : "secondary"}>
          <Link href={`/admin/cms/new?kind=${k}`}>{t(k === "story" ? "newStory" : k === "faq" ? "newFaq" : "newPage")}</Link>
        </Button>
      ))}
    </>
  ) : null;
  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} actions={newLinks} />
      <LoaderState result={result} empty={{ title: t("emptyTitle"), description: t("emptyBody") }}>
        {(d) => (
          <RecordList
            label={t("title")}
            rows={d.rows}
            rowKey={(r) => r.id}
            columns={[
              {
                key: "slug",
                header: t("columns.slug"),
                primary: true,
                cell: (r) => (
                  <Link href={`/admin/cms/${encodeURIComponent(r.id)}`} className="font-semibold text-forest underline underline-offset-4">
                    {r.slug}
                  </Link>
                ),
              },
              { key: "kind", header: t("columns.kind"), cell: (r) => t(`kind.${r.kind}`) },
              {
                key: "locales",
                header: t("columns.locales"),
                cell: (r) => (
                  <ul className="grid gap-1">
                    {r.locales.map((c) => (
                      <li key={c.locale} className="flex flex-wrap items-center gap-2">
                        <span className="w-16 text-sm text-muted">{tl(c.locale)}</span>
                        {c.status ? <OpsStatus status={c.status} /> : <span className="text-sm text-muted">{t("missing")}</span>}
                        {c.hasUnpublishedChanges ? <span className="text-sm text-warning-text">{t("unpublishedChanges")}</span> : null}
                      </li>
                    ))}
                  </ul>
                ),
              },
            ]}
          />
        )}
      </LoaderState>
    </div>
  );
}

export function CmsEditorView({ result }: { result: LoaderResult<ContentEditorVM> }) {
  const t = useTranslations("admin.cms");
  const tl = useTranslations("common.locales");
  const labels = useEditorLabels();
  const locale = useAppLocale();
  const title = result.status === "ok" ? t("editorTitle", { slug: result.data.slug }) : t("title");
  return (
    <div className="grid gap-8">
      <PageHeader
        title={title}
        breadcrumb={
          <Link href="/admin/cms" className="text-base text-forest underline underline-offset-4">
            {t("back")}
          </Link>
        }
      />
      <LoaderState result={result} empty={{ title }}>
        {(vm) => (
          <div className="grid gap-10">
            <nav aria-label={t("localeNav")}>
              <ul className="flex flex-wrap gap-2">
                {vm.locales.map((c) => (
                  <li key={c.locale}>
                    <Link
                      href={`/admin/cms/${encodeURIComponent(vm.id)}?locale=${c.locale}`}
                      aria-current={c.locale === vm.locale ? "page" : undefined}
                      className="inline-flex min-h-target items-center gap-2 rounded-full border border-border px-4 text-base text-ink hover:bg-mist aria-[current=page]:border-forest aria-[current=page]:bg-mist aria-[current=page]:font-semibold"
                    >
                      {tl(c.locale)}
                      {c.status ? null : <span className="text-sm text-muted">({t("missing")})</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            {vm.expectedVersion === null ? <Notice tone="info">{t("noVersion")}</Notice> : null}
            <CmsEditorForm
              key={`${vm.id}-${vm.locale}-${vm.expectedVersion ?? 0}`}
              initial={vm.form}
              slugLocked
              run={cmsSaveDraftAction.bind(null, { entryId: vm.id, expectedVersion: vm.expectedVersion })}
              labels={labels}
            />
            {vm.expectedVersion !== null ? (
              <div className="grid gap-3">
                <div className="flex flex-wrap gap-3">
                  {vm.actions.map((a) => (
                    <OpsAction
                      key={a}
                      variant={a === "publish" ? "primary" : "secondary"}
                      tone={a === "archive" ? "danger" : "primary"}
                      run={cmsTransitionAction.bind(null, { entryId: vm.id, locale: vm.locale, action: a, expectedVersion: vm.expectedVersion as number })}
                      labels={{
                        label: t(`actions.${a}`),
                        done: t("actionDone"),
                        ...(a === "publish"
                          ? { confirm: { title: t("confirm.publishTitle"), description: t("confirm.publishBody"), confirmLabel: t("actions.publish") } }
                          : a === "archive"
                            ? { confirm: { title: t("confirm.archiveTitle"), description: t("confirm.archiveBody"), confirmLabel: t("actions.archive") } }
                            : {}),
                      }}
                    />
                  ))}
                </div>
                {vm.publishBlockedKey ? <Notice tone="warning">{t("publishBlocked.consentRequired")}</Notice> : null}
              </div>
            ) : null}
            {vm.preview ? (
              <section aria-labelledby="cms-preview" className="grid gap-4 rounded-lg border border-border bg-surface p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 id="cms-preview" className="text-xl font-semibold text-ink">
                    {t("previewTitle")}
                  </h2>
                  <OpsStatus status={vm.preview.status} />
                </div>
                <p className="text-sm text-muted">{vm.preview.isLive ? t("previewLive") : t("previewNotLive")}</p>
                {vm.preview.content.kind === "faq" ? (
                  <div className="grid gap-2">
                    <h3 className="text-lg font-semibold text-ink">{vm.preview.content.question}</h3>
                    <RichText doc={vm.preview.content.answer} />
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <h3 className="font-display text-2xl font-medium text-ink">{vm.preview.content.title}</h3>
                    {vm.preview.content.summary ? <p className="text-lg text-muted">{vm.preview.content.summary}</p> : null}
                    <RichText doc={vm.preview.content.body} />
                  </div>
                )}
              </section>
            ) : null}
            <section aria-labelledby="cms-revisions" className="grid gap-3">
              <h2 id="cms-revisions" className="text-xl font-semibold text-ink">
                {t("revisionsTitle")}
              </h2>
              <ol aria-label={t("revisionsTitle")} className="grid gap-2">
                {vm.revisions.map((r, i) => (
                  <li key={`${r.revision}-${r.editedAt}-${i}`} className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold text-ink">{t("revisionLine", { revision: r.revision })}</span>
                    <OpsStatus status={r.status} />
                    <time dateTime={r.editedAt} className="text-sm text-muted">
                      {formatDateTime(r.editedAt, locale)}
                    </time>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </LoaderState>
    </div>
  );
}

export function CmsNewView({ kind, locale }: { kind: ContentKind; locale: Locale }) {
  const t = useTranslations("admin.cms");
  const labels = useEditorLabels();
  return (
    <div className="grid gap-8">
      <PageHeader
        title={t("newTitle", { kind: t(`kind.${kind}`) })}
        breadcrumb={
          <Link href="/admin/cms" className="text-base text-forest underline underline-offset-4">
            {t("back")}
          </Link>
        }
      />
      <CmsEditorForm initial={emptyEditorForm(kind, locale)} slugLocked={false} run={cmsSaveDraftAction.bind(null, { entryId: null, expectedVersion: null })} labels={labels} />
    </div>
  );
}

export const isContentKind = (v: unknown): v is ContentKind => v === "story" || v === "faq" || v === "page";
export const isContentLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);
