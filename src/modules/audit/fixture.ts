import { fail, ok } from "@/lib/api/result";
import { adminPrincipals } from "@/fixtures/operations/admin";
import { auditFixtures } from "@/fixtures/operations/audit";
import { assertFixtureAllowed, cloneFixture } from "@/fixtures/operations/guard";
import type { AdminPrincipal } from "@/modules/admin/capabilities";
import type { AuditApi } from "./api";
import { applyAuditFilter, auditFilterSchema, canReadAudit, redactAuditEvent, scopedAuditEvents } from "./rules";

export type AuditFixtureOptions = {
  env?: Record<string, string | undefined>;
  principal?: AdminPrincipal | null;
  now?: () => Date;
};

/** Synthetic audit adapter: redacts, scopes and filters exactly like the UI contract requires. */
export function createAuditFixtureApi(options: AuditFixtureOptions = {}): AuditApi {
  const env = options.env ?? process.env;
  assertFixtureAllowed(env);
  const principal = options.principal === undefined ? adminPrincipals.superAdmin : options.principal;
  const now = options.now ?? (() => new Date());
  const events = cloneFixture(auditFixtures.rawEvents).map(redactAuditEvent);

  return {
    mode: "fixture",
    async listEvents(filter = {}) {
      if (!canReadAudit(principal, now())) return fail("forbidden");
      const parsed = auditFilterSchema.safeParse(filter);
      if (!parsed.success) return fail("validation");
      const scoped = scopedAuditEvents(principal, events, now());
      return ok({ items: applyAuditFilter(scoped, parsed.data), nextCursor: null });
    },
  };
}
