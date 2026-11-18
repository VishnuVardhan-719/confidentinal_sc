import { fail, ok, type ApiResult } from "@/lib/api/result";
import { adminFixtures, adminPrincipals } from "@/fixtures/operations/admin";
import { assertFixtureAllowed, cloneFixture, createReplayCache } from "@/fixtures/operations/guard";
import type { AdminApi } from "./api";
import { can, type AdminCapability, type AdminPrincipal } from "./capabilities";
import {
  adminInviteSchema,
  canManageAdmin,
  coverageDecisionDenial,
  filterProviderReviews,
  gateSettings,
  normalizeBookingReference,
  reviewDecisionDenial,
  reviewReasonSchema,
} from "./rules";
import type { AdminInvite, AdminUserSummary, CoverageArea } from "./types";

export type AdminFixtureOptions = {
  env?: Record<string, string | undefined>;
  /** Synthetic signed-in admin the fixture "server" authorizes. */
  principal?: AdminPrincipal | null;
  now?: () => Date;
};

const maskEmail = (email: string): string => {
  const [local, domain] = email.split("@");
  return `${(local ?? "").slice(0, 1)}***@${domain ?? ""}`;
};

/** Synthetic admin adapter. Enforces the capability model; refuses production. */
export function createAdminFixtureApi(options: AdminFixtureOptions = {}): AdminApi {
  const env = options.env ?? process.env;
  assertFixtureAllowed(env);
  const principal = options.principal === undefined ? adminPrincipals.verifier : options.principal;
  const now = options.now ?? (() => new Date());
  const data = cloneFixture(adminFixtures);
  const once = createReplayCache();
  let inviteSeq = 1;

  const allowed = (capability: AdminCapability) => can(principal, capability, { now: now() });
  const guard = <T>(capability: AdminCapability, run: () => ApiResult<T>): ApiResult<T> =>
    allowed(capability) ? run() : fail("forbidden");
  const page = <T>(items: T[]) => ok({ items, nextCursor: null });

  return {
    mode: "fixture",

    async listProviderReviews(filter = {}) {
      return guard("provider:verify", () => {
        const queue = data.reviews.map(({ providerId, category, displayName, verificationState, submittedAt, earliestDocumentExpiry, version }) => ({
          providerId, category, displayName, verificationState, submittedAt, earliestDocumentExpiry, version,
        }));
        return page(filterProviderReviews(queue, filter));
      });
    },

    async getProviderReview(providerId) {
      return guard("provider:verify", () => {
        const found = data.reviews.find((r) => r.providerId === providerId);
        return found ? ok(cloneFixture(found)) : fail("not_found");
      });
    },

    async decideProviderReview(input) {
      return once("review", input.idempotencyKey, () => {
        const detail = data.reviews.find((r) => r.providerId === input.providerId);
        if (!allowed("provider:verify")) return fail("forbidden");
        if (!detail) return fail("not_found");
        const denial = reviewDecisionDenial(principal, detail, input.decision, input.reason, now());
        if (denial === "no_capability" || denial === "self_approval") return fail("forbidden");
        if (denial === "invalid_transition") return fail("conflict");
        if (denial === "reason_required") return fail("validation", { fields: { reason: "required" } });
        if (detail.version !== input.expectedVersion) return fail("conflict");
        detail.verificationState = input.decision;
        detail.version += 1;
        detail.history.push({ decision: input.decision, reason: input.reason.trim(), reviewerProfileId: principal?.profileId ?? "", at: now().toISOString() });
        return ok({ providerId: detail.providerId, verificationState: detail.verificationState, version: detail.version });
      });
    },

    async listCoverage(filter = {}) {
      return guard("coverage:verify", () =>
        page(
          data.coverage.filter(
            (a) =>
              (filter.status === undefined || a.status === filter.status) &&
              (filter.category === undefined || a.category === filter.category) &&
              (filter.pin === undefined || a.pin === filter.pin),
          ),
        ),
      );
    },

    async decideCoverage(input) {
      return once("coverage", input.idempotencyKey, (): ApiResult<CoverageArea> => {
        if (!allowed("coverage:verify")) return fail("forbidden");
        const area = data.coverage.find((a) => a.areaId === input.areaId);
        if (!area) return fail("not_found");
        const denial = coverageDecisionDenial(principal, area, input.decision, input.reason, input.validUntil, now());
        if (denial === "no_capability") return fail("forbidden");
        if (denial === "invalid_transition") return fail("conflict");
        if (denial === "reason_required") return fail("validation", { fields: { reason: "required" } });
        if (denial === "valid_until_required") return fail("validation", { fields: { validUntil: "required" } });
        if (area.version !== input.expectedVersion) return fail("conflict");
        const at = now().toISOString();
        area.status = input.decision;
        if (input.decision === "approved") {
          area.validFrom = at;
          area.validTo = input.validUntil ?? null;
        }
        area.version += 1;
        // Every coverage change is recorded (audited) with actor, reason and time.
        data.coverageHistory.push({ areaId: area.areaId, decision: input.decision, reason: input.reason.trim(), actorProfileId: principal?.profileId ?? "", at });
        return ok(cloneFixture(area));
      });
    },

    async listCoverageHistory(areaId) {
      return guard("coverage:verify", () => ok(data.coverageHistory.filter((c) => c.areaId === areaId)));
    },

    async findBookingByReference(reference) {
      return guard("booking:operate", () => {
        const normalized = normalizeBookingReference(reference);
        if (normalized === null) return fail("validation", { fields: { reference: "format" } });
        const found = data.bookings.find((b) => b.reference === normalized);
        return found ? ok(found) : fail("not_found");
      });
    },

    async listBookingExceptions() {
      return guard("booking:operate", () => page(data.bookings.filter((b) => b.exceptions.some((e) => e.status === "open"))));
    },

    async listAdmins() {
      return guard("membership:admin", () => ok(data.admins));
    },

    async listAdminInvites() {
      return guard("membership:admin", () => ok(data.invites));
    },

    async inviteAdmin(input) {
      return once("invite", input.idempotencyKey, (): ApiResult<AdminInvite> => {
        if (!allowed("membership:admin") || !principal) return fail("forbidden");
        const parsed = adminInviteSchema.safeParse({ email: input.email, capabilities: input.capabilities, scope: input.scope });
        if (!parsed.success) return fail("validation");
        const invite: AdminInvite = {
          id: `fx-inv-new-${inviteSeq++}`,
          maskedEmail: maskEmail(parsed.data.email),
          capabilities: parsed.data.capabilities,
          scope: parsed.data.scope,
          status: "pending",
          invitedByProfileId: principal.profileId,
          invitedAt: now().toISOString(),
        };
        data.invites.push(invite);
        return ok(invite);
      });
    },

    async setAdminScope(input) {
      return once("scope", input.idempotencyKey, (): ApiResult<AdminUserSummary> => {
        if (!canManageAdmin(principal, input.profileId, now())) return fail("forbidden");
        const target = data.admins.find((a) => a.profileId === input.profileId);
        if (!target) return fail("not_found");
        target.grants = input.capabilities.map((capability) => ({ capability, scope: input.scope, expiresAt: null }));
        return ok(cloneFixture(target));
      });
    },

    async suspendAdmin(input) {
      return once("suspend", input.idempotencyKey, (): ApiResult<AdminUserSummary> => {
        if (!canManageAdmin(principal, input.profileId, now())) return fail("forbidden");
        if (!reviewReasonSchema.safeParse(input.reason).success) return fail("validation", { fields: { reason: "required" } });
        const target = data.admins.find((a) => a.profileId === input.profileId);
        if (!target) return fail("not_found");
        if (target.status === "suspended") return fail("conflict");
        target.status = "suspended";
        return ok(cloneFixture(target));
      });
    },

    async listPayments() {
      return guard("payment:read", () => page(data.payments));
    },

    async listRefunds() {
      return guard("payment:read", () => page(data.refunds));
    },

    async listSupportQueue() {
      return guard("support:operate", () => page(data.support));
    },

    async getSettings() {
      return guard("settings:read", () => ok(gateSettings(env)));
    },
  };
}
