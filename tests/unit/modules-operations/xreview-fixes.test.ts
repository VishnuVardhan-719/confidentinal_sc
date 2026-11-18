import { describe, expect, it, vi } from "vitest";
import { fail } from "@/lib/api/result";
import { ambulanceActors, ambulanceFixtures } from "@/fixtures/operations/ambulance";
import { adminPrincipals } from "@/fixtures/operations/admin";
import { careActors, caretakerFixtures } from "@/fixtures/operations/caretaker";
import { labFixtures } from "@/fixtures/operations/lab";
import { workspaceMemberships as W } from "@/fixtures/operations/workspaces";
import { toLoaderResult } from "@/modules/admin/access";
import { createAdminHttpApi, issueFields } from "@/modules/admin/http";
import { paymentAmountsMismatch, toPaymentRow } from "@/modules/admin/view-models";
import { listWorkspaces, toCareActor, type WorkspaceMembership } from "@/modules/admin/workspace";
import { createAmbulanceFixtureApi, createAmbulanceFixtureStore } from "@/modules/ambulance/fixture";
import { DRIVER_VIEW_LEAD_MINUTES, selectDriverQueue, tripActionDenial, tripInDriverWindow } from "@/modules/ambulance/rules";
import type { Trip } from "@/modules/ambulance/types";
import { countOverlappingToday, istDayBounds } from "@/modules/caretaker/loaders";
import { caretakerRoutePermits } from "@/modules/caretaker/routes";
import { careActionDenial } from "@/modules/caretaker/rules";
import { availableContentActions, emptyEditorForm, parseEditorMarkup, parseInline, publishBlockedKey, serializeEditorMarkup, validateEditorForm } from "@/modules/content/editor";
import { createContentFixtureApi, createContentFixtureStore } from "@/modules/content/fixture";
import { contentActionDenial, publishConsentDenial } from "@/modules/content/rules";
import { contentDraftSchema, richTextDoc } from "@/modules/content/schema";
import type { ContentBody } from "@/modules/content/types";
import { orderTotalsConsistent } from "@/modules/lab/rules";

const NOW = new Date("2026-11-20T03:00:00Z");

describe("E1 rich-text leaves keep their spaces", () => {
  it("inline runs keep the spaces between nodes after validation", () => {
    const doc = richTextDoc.parse({ type: "doc", blocks: [{ type: "paragraph", children: parseInline("Hello **world** today") }] });
    const block = doc.blocks[0];
    if (block.type !== "paragraph") throw new Error("paragraph expected");
    expect(block.children.map((n) => (n.type === "text" ? n.text : ""))).toEqual(["Hello ", "world", " today"]);
  });

  it("a space-only node between links is valid; an all-space block is not", () => {
    expect(richTextDoc.safeParse(parseEditorMarkup("[a](/x) [b](/y)")).success).toBe(true);
    const blank = richTextDoc.safeParse({ type: "doc", blocks: [{ type: "paragraph", children: [{ type: "text", text: "   " }] }] });
    expect(blank.success).toBe(false);
    const form = { ...emptyEditorForm("story", "en"), slug: "e1", title: "  Title  ", bodyText: "[a](/x) [b](/y)", noIdentifiablePerson: true };
    const valid = validateEditorForm(form);
    expect(valid.ok && valid.draft.kind === "story" && valid.draft.title).toBe("Title"); // field-level text is still trimmed
  });

  it("leaves still reject markup and control characters are stripped", () => {
    expect(richTextDoc.safeParse({ type: "doc", blocks: [{ type: "paragraph", children: [{ type: "text", text: "x <b>y</b>" }] }] }).success).toBe(false);
    const doc = richTextDoc.parse({ type: "doc", blocks: [{ type: "paragraph", children: [{ type: "text", text: "a\u202Eb " }] }] });
    expect(doc.blocks[0].type === "paragraph" && doc.blocks[0].children[0]).toEqual({ type: "text", text: "ab " });
  });
});

describe("E2 driver sees the current trip only", () => {
  const base = ambulanceFixtures.trips.find((t) => t.id === "fx-trip-1")!;
  const nextWeek: Trip = { ...structuredClone(base), id: "fx-trip-later", reference: "#SCV-BKG-900399", window: { start: "2026-11-27T04:00:00Z", end: "2026-11-27T05:00:00Z" } };
  const trips = [base, nextWeek];

  it("projects one current trip and only a count of later ones, without their places", () => {
    const q = selectDriverQueue(trips, ambulanceActors.driverA, NOW);
    expect(q.current?.tripId).toBe("fx-trip-1");
    expect(q.laterCount).toBe(1);
    expect(JSON.stringify(q)).not.toContain(nextWeek.reference);
    const early = selectDriverQueue(trips, ambulanceActors.driverA, new Date("2026-11-19T00:00:00Z"));
    expect(early).toEqual({ current: null, laterCount: 2 });
  });

  it("milestones are refused outside the window; a trip under way stays current", () => {
    expect(tripActionDenial(ambulanceActors.driverA, nextWeek, "en_route", undefined, NOW)).toBe("outside_window");
    expect(tripActionDenial(ambulanceActors.driverA, base, "en_route", undefined, NOW)).toBeNull();
    const leadEdge = new Date(Date.parse(base.window.start) - DRIVER_VIEW_LEAD_MINUTES * 60_000 - 1);
    expect(tripInDriverWindow(base, leadEdge)).toBe(false);
    expect(tripInDriverWindow({ ...base, state: "en_route", window: { start: "2026-12-31T00:00:00Z", end: "2026-12-31T01:00:00Z" } }, NOW)).toBe(true);
    expect(tripInDriverWindow({ ...base, window: { start: "garbage", end: "garbage" } }, NOW)).toBe(false);
  });

  it("fixture refuses reading or progressing a trip before its window", async () => {
    const api = createAmbulanceFixtureApi({ env: {}, actor: ambulanceActors.driverA, now: () => new Date("2026-11-19T00:00:00Z") });
    expect(await api.getDriverQueue()).toEqual({ ok: true, data: { current: null, laterCount: 1 } });
    expect(await api.getDriverTrip("fx-trip-1")).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await api.performTripAction({ tripId: "fx-trip-1", action: "en_route", expectedVersion: 2, idempotencyKey: "w" })).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("only the queue's current trip can be progressed, even when a later trip is also inside its window", async () => {
    const store = createAmbulanceFixtureStore();
    const current = store.trips.find((t) => t.id === "fx-trip-1")!; // 04:00Z
    const later: Trip = { ...structuredClone(current), id: "fx-trip-1b", reference: "#SCV-BKG-900398", window: { start: "2026-11-20T05:00:00Z", end: "2026-11-20T06:00:00Z" }, version: 1 };
    store.trips.push(later);
    const at = new Date("2026-11-20T03:30:00Z"); // both trips are inside the 120-minute lead
    expect(tripInDriverWindow(later, at)).toBe(true);
    const api = createAmbulanceFixtureApi({ env: {}, actor: ambulanceActors.driverA, now: () => at, store });

    const denied = await api.performTripAction({ tripId: later.id, action: "en_route", expectedVersion: 1, idempotencyKey: "l1" });
    expect(denied).toEqual({ ok: false, error: { code: "not_found" } });
    expect(JSON.stringify(denied)).not.toContain("Fixture Nagar");
    expect(store.trips.find((t) => t.id === later.id)).toMatchObject({ state: "assigned", version: 1 });
    expect(store.trips.find((t) => t.id === later.id)?.history).toHaveLength(1);

    // The current trip runs to its final milestone; that last step is accepted although it ends the trip.
    let v = current.version;
    for (const action of ["en_route", "arrived", "picked_up", "destination_reached"] as const) {
      const r = await api.performTripAction({ tripId: current.id, action, expectedVersion: v, idempotencyKey: `c-${action}` });
      expect(r.ok && r.data.state).toBe(action);
      v += 1;
    }
    // Now the later trip becomes current and can be progressed.
    expect((await api.getDriverQueue())).toMatchObject({ ok: true, data: { current: { tripId: later.id }, laterCount: 0 } });
    const next = await api.performTripAction({ tripId: later.id, action: "en_route", expectedVersion: 1, idempotencyKey: "l2" });
    expect(next.ok && next.data.state).toBe("en_route");
  });
});

describe("E3 only the owner of an individually owned provider is independent", () => {
  const indep = W.independentCaregiver[0];
  const asMember = (over: Partial<WorkspaceMembership>) => listWorkspaces([{ ...indep, ...over }], "caretaker")[0];

  it("staff and billing memberships are not independent and cannot open provider-wide pages", () => {
    const staff = asMember({ membershipRole: "staff", profileId: "fx-prof-staff" });
    expect(toCareActor(staff).kind).toBe("agency_caregiver");
    for (const route of ["requests", "services", "availability", "billing"] as const) expect(caretakerRoutePermits(route, staff)).toBe(false);
    const billing = asMember({ membershipRole: "billing" });
    expect(caretakerRoutePermits("billing", billing)).toBe(true);
    expect(caretakerRoutePermits("requests", billing)).toBe(false);
    expect(toCareActor(asMember({})).kind).toBe("independent");
  });
});

describe("E4 caretaker today metric", () => {
  it("IST day bounds start at 18:30Z the previous UTC day", () => {
    const { start, end } = istDayBounds(NOW);
    expect(new Date(start).toISOString()).toBe("2026-11-19T18:30:00.000Z");
    expect(end - start).toBe(86_400_000);
  });

  it("counts multi-day care overlapping today and fails closed on bad dates", () => {
    const items = [
      { interval: { start: "2026-11-19T02:00:00Z", end: "2026-11-21T02:00:00Z" } }, // started yesterday, runs today
      { interval: { start: "2026-11-19T02:00:00Z", end: "2026-11-19T10:00:00Z" } }, // ended before today
      { interval: { start: "2026-11-20T10:00:00Z", end: "2026-11-20T12:00:00Z" } }, // later today
    ];
    expect(countOverlappingToday(items, NOW)).toBe(2);
    expect(countOverlappingToday([...items, { interval: { start: "garbage", end: "2026-11-20T00:00:00Z" } }], NOW)).toBeNull();
  });
});

describe("E5 care cannot start after its interval", () => {
  const a = caretakerFixtures.assignments[0]; // 03:30-07:30Z on 2026-11-20
  it("too_late after the end and invalid_interval for bad or inverted dates", () => {
    expect(careActionDenial(careActors.caregiverA, a, "start", { now: new Date("2026-11-20T07:30:00Z") })).toBe("too_late");
    expect(careActionDenial(careActors.caregiverA, { ...a, interval: { start: "x", end: a.interval.end } }, "start", { now: NOW })).toBe("invalid_interval");
    expect(careActionDenial(careActors.caregiverA, { ...a, interval: { start: a.interval.end, end: a.interval.start } }, "start", { now: NOW })).toBe("invalid_interval");
    expect(careActionDenial(careActors.caregiverA, a, "start", { now: new Date("2026-11-20T05:00:00Z") })).toBeNull();
  });
});

describe("E6 lab totals reject negative amounts", () => {
  const o = structuredClone(labFixtures.orders.find((x) => x.id === "fx-lab-order-1")!);
  it("negative unit/line/total prices are inconsistent", () => {
    expect(orderTotalsConsistent(o)).toBe(true);
    const neg = { ...o, lines: [{ ...o.lines[0], unitPricePaise: -5000, lineTotalPaise: -5000 }], totalPaise: -5000 };
    expect(orderTotalsConsistent(neg)).toBe(false);
    expect(orderTotalsConsistent({ ...o, totalPaise: 45000.5 })).toBe(false);
  });
});

describe("E7 outstanding comes from the server; mismatches are flagged", () => {
  const p = { bookingReference: "#SCV-BKG-900001", status: "due" as const, amountDuePaise: 10000, collectedPaise: 0, outstandingPaise: 10000, method: null, gatewayReference: null, reconciliation: "unreconciled" as const, testMode: false, updatedAt: "2026-11-20T00:00:00Z" };
  it("uses the server value and flags overpayment instead of clamping", () => {
    expect(toPaymentRow(p)).toMatchObject({ outstandingPaise: 10000, reconciliationMismatch: false });
    const over = toPaymentRow({ ...p, collectedPaise: 12000, outstandingPaise: 0 });
    expect(over).toMatchObject({ outstandingPaise: 0, reconciliationMismatch: true });
    expect(paymentAmountsMismatch({ amountDuePaise: 10000, collectedPaise: 4000, outstandingPaise: 5000 })).toBe(true);
    expect(paymentAmountsMismatch({ amountDuePaise: 10000, collectedPaise: -1, outstandingPaise: 10001 })).toBe(true);
  });
});

describe("E8/E9 validation fields are precise and reach the page", () => {
  it("provider-review body errors name the actual field", async () => {
    const fetchImpl = vi.fn();
    const api = createAdminHttpApi({ fetchImpl, env: {} });
    const bad = await api.decideProviderReview({ providerId: "p", decision: "approve" as never, reason: "ok", expectedVersion: 0, idempotencyKey: "k" });
    expect(bad).toEqual({ ok: false, error: { code: "validation", fields: { decision: "invalid", expectedVersion: "required" } } });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(issueFields([{ path: [], code: "custom" }])).toEqual({ body: "invalid" });
  });

  it("loader results keep validation fields", () => {
    expect(toLoaderResult(fail("validation", { fields: { reference: "format" } }), "http")).toEqual({ status: "error", code: "validation", fields: { reference: "format" } });
  });
});

describe("E10 bold+italic round-trips", () => {
  it("***text*** parses to both marks and serializes back", () => {
    expect(parseInline("a ***b*** c")).toEqual([{ type: "text", text: "a " }, { type: "text", text: "b", marks: ["bold", "italic"] }, { type: "text", text: " c" }]);
    const src = "x ***both*** **bold** *it*";
    expect(serializeEditorMarkup(parseEditorMarkup(src))).toBe(src);
    expect(richTextDoc.safeParse({ type: "doc", blocks: [{ type: "paragraph", children: [{ type: "text", text: "d", marks: ["bold", "bold"] }] }] }).success).toBe(false);
  });
});

describe("E11 consent gate on publishing stories", () => {
  const story = (over: Partial<Extract<ContentBody, { kind: "story" | "page" }>> = {}): ContentBody => ({
    kind: "story", title: "T", summary: "", body: parseEditorMarkup("Body"), consentEvidenceId: null, noIdentifiablePerson: false, ...over,
  });

  it("publish needs consent evidence or an explicit no-identifiable-person attestation", () => {
    expect(publishConsentDenial(story())).toBe("consent_required");
    expect(publishConsentDenial(story({ consentEvidenceId: "fx-consent-9" }))).toBeNull();
    expect(publishConsentDenial(story({ noIdentifiablePerson: true }))).toBeNull();
    expect(publishConsentDenial({ kind: "faq", question: "Q", answer: parseEditorMarkup("A"), order: 0 })).toBeNull();
    expect(contentActionDenial(adminPrincipals.contentPublisher, "in_preview", "publish", NOW, story())).toBe("consent_required");
    expect(contentActionDenial(adminPrincipals.contentPublisher, "in_preview", "publish", NOW)).toBe("consent_required");
    expect(availableContentActions(adminPrincipals.contentPublisher, "in_preview", NOW, story())).toEqual(["return_to_draft"]);
    expect(publishBlockedKey(story())).toBe("admin.cms.publishBlocked.consentRequired");
    expect(publishBlockedKey(story({ noIdentifiablePerson: true }))).toBeNull();
  });

  it("schema defaults the attestation to false; the editor form carries it", () => {
    const parsed = contentDraftSchema.parse({ kind: "story", slug: "s", locale: "en", title: "T", summary: "", body: parseEditorMarkup("B"), consentEvidenceId: null });
    expect(parsed.kind === "story" && parsed.noIdentifiablePerson).toBe(false);
    const res = validateEditorForm({ ...emptyEditorForm("story", "en"), slug: "s", title: "T", bodyText: "B", noIdentifiablePerson: true });
    expect(res.ok && res.draft.kind === "story" && res.draft.noIdentifiablePerson).toBe(true);
  });

  it("fixture refuses publishing a story without consent and allows it with the attestation", async () => {
    const store = createContentFixtureStore();
    const editor = createContentFixtureApi({ env: {}, principal: adminPrincipals.contentEditor, store });
    const publisher = createContentFixtureApi({ env: {}, principal: adminPrincipals.contentPublisher, store });
    const draft = { kind: "story", slug: "consent-story", locale: "en", title: "T", summary: "", body: parseEditorMarkup("B"), consentEvidenceId: null };
    const saved = await editor.saveDraft({ entryId: null, draft, expectedVersion: null, idempotencyKey: "c1" });
    if (!saved.ok) throw new Error("save failed");
    await editor.transition({ entryId: saved.data.id, locale: "en", action: "submit_preview", expectedVersion: 1, idempotencyKey: "c2" });
    const denied = await publisher.transition({ entryId: saved.data.id, locale: "en", action: "publish", expectedVersion: 2, idempotencyKey: "c3" });
    expect(denied).toEqual({ ok: false, error: { code: "validation", fields: { consent: "required" } } });
    await editor.transition({ entryId: saved.data.id, locale: "en", action: "return_to_draft", expectedVersion: 2, idempotencyKey: "c4" });
    await editor.saveDraft({ entryId: saved.data.id, draft: { ...draft, noIdentifiablePerson: true }, expectedVersion: 3, idempotencyKey: "c5" });
    await editor.transition({ entryId: saved.data.id, locale: "en", action: "submit_preview", expectedVersion: 4, idempotencyKey: "c6" });
    const ok = await publisher.transition({ entryId: saved.data.id, locale: "en", action: "publish", expectedVersion: 5, idempotencyKey: "c7" });
    expect(ok.ok && ok.data.locales.en?.published?.revision).toBe(1);
  });
});
