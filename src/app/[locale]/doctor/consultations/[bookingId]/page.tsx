import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { GateNotice } from "@/components/shared/gate-notice";
import { Notice } from "@/components/shared/notice";
import { PageHeader } from "@/components/shared/page-header";
import type { StatusDescriptor } from "@/components/shared/status";
import { getClinicalFormat } from "@/components/clinical/server-format";
import { ConsultationContext } from "@/components/doctor/consultation-context";
import { guardDoctorPage } from "@/components/doctor/guard";
import { NoteEditor } from "@/components/doctor/note-editor";
import { PageStateView } from "@/components/doctor/page-state-view";
import { Link } from "@/i18n/navigation";
import { isClinicalEnabled } from "@/modules/clinical/gate";
import { getConsultationNotesApi, NOTE_SECTIONS, type ConsultationNote } from "@/modules/consultation-notes";
import { getDoctorApi } from "@/modules/doctor";
import { parseRouteId, toPageState } from "@/modules/doctor/routing";
import { saveNoteDraftAction, signOffNoteAction } from "../actions";

export async function generateMetadata() {
  const t = await getTranslations("consultationNotes");
  // No patient name or clinical text in the title.
  return { title: t("title"), robots: { index: false } };
}

function noteBadge(note: ConsultationNote | null, label: { none: string; draft: string; signed: string }): StatusDescriptor {
  if (!note) return { tone: "neutral", label: label.none };
  return note.status === "signed_off" ? { tone: "success", icon: "check", label: label.signed } : { tone: "warning", icon: "pause", label: label.draft };
}

/** Post-visit consultation notes: completed bookings only; draft -> sign-off; read-only after. */
export default async function ConsultationNotesPage({ params }: PageProps<"/[locale]/doctor/consultations/[bookingId]">) {
  const { locale, bookingId: raw } = await params;
  const g = await guardDoctorPage(locale, `/consultations/${raw}`);
  if (!g.ok) return g.view;
  const [t, nav, tv] = await Promise.all([getTranslations("consultationNotes"), getTranslations("doctor.shell.nav"), getTranslations("doctor.visit")]);
  const id = parseRouteId(raw);
  const crumbs = (
    <Breadcrumb
      items={[{ label: nav("visits"), href: "/doctor/visits" }, ...(id ? [{ label: tv("titleFallback"), href: `/doctor/visits/${id}` }] : []), { label: t("title") }]}
    />
  );
  const header = <PageHeader title={t("title")} description={t("description")} breadcrumb={crumbs} />;
  const frame = (body: React.ReactNode) => (
    <div className="grid gap-8">
      {g.session.synthetic ? <p className="text-sm text-muted">{t("synthetic")}</p> : null}
      {header}
      {body}
    </div>
  );

  // Gate first: no clinical request is made while the flag is off.
  if (!isClinicalEnabled()) return frame(<GateNotice feature="clinical">{t("gated")}</GateNotice>);
  if (!id) return frame(<PageStateView state={{ kind: "not_found" }} />);

  const ctx = g.session.ctx;
  const [visit, note] = await Promise.all([getDoctorApi(process.env, ctx).getVisit(id), getConsultationNotesApi(process.env, ctx).getNote(id)]);
  if (!visit.ok) {
    const s = toPageState(visit);
    return frame(s.kind === "ready" ? null : <PageStateView state={s} />);
  }
  if (!note.ok) {
    const s = toPageState(note);
    return frame(s.kind === "ready" ? null : <PageStateView state={s} />);
  }
  const v = visit.data;
  const context = <ConsultationContext visit={v} documentLabel={t("documentLabel")} documentBadge={noteBadge(note.data, { none: t("badge.none"), draft: t("badge.draft"), signed: t("badge.signed_off") })} />;
  const back = (
    <Button asChild variant="secondary">
      <Link href={`/doctor/visits/${id}`}>{t("backToVisit")}</Link>
    </Button>
  );

  if (v.state !== "completed") {
    return frame(
      <>
        {context}
        <Notice tone="info" title={t("notCompleted.title")} action={back}>
          {t("notCompleted.body")}
        </Notice>
      </>,
    );
  }
  if (note.data?.status === "signed_off") return frame(<>{context}<SignedNote note={note.data} /></>);
  return frame(
    <>
      {context}
      <NoteEditor bookingId={id} initial={note.data} actions={{ save: saveNoteDraftAction, signOff: signOffNoteAction }} />
    </>,
  );
}

async function SignedNote({ note }: { note: ConsultationNote }) {
  const [t, f] = await Promise.all([getTranslations("consultationNotes"), getClinicalFormat()]);
  return (
    <section aria-labelledby="signed-note" className="grid max-w-form gap-5">
      <div className="grid gap-1">
        <h2 id="signed-note" className="text-lg font-semibold text-ink">
          {t("signed.title")}
        </h2>
        <p className="text-sm text-muted tabular">
          {t("signed.by", { name: note.signedOffBy?.displayName ?? "", time: note.signedOffAt ? f.dateTime(note.signedOffAt) : "" })} · {t("signed.version", { version: note.version })}
        </p>
        <p className="text-sm text-muted">{t("signed.readOnly")}</p>
      </div>
      <dl className="grid gap-4">
        {NOTE_SECTIONS.map((s) => (
          <div key={s} className="grid gap-1">
            <dt className="text-sm font-semibold text-ink">{t(`sections.${s}.label`)}</dt>
            <dd className="whitespace-pre-wrap text-ink">{note.sections[s].trim() || <span className="text-muted">{t("signed.empty")}</span>}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
