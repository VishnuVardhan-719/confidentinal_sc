import { z } from "zod";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import { getAdapterMode } from "@/lib/api/mode";
import { assertFixtureAllowed, type FixtureOptions } from "@/modules/auth/fixture-guard";
import { createJsonClient, toApiResult, validateInput, type HttpAdapterOptions } from "@/modules/auth/http-client";
import { organizationScopeSchema, type OrganizationScope } from "./types";

/**
 * Staff invitations (FRONTEND_MASTER s8 "Admin and staff", s15 "Invite acceptance validates
 * server membership and scope"). Accepting is a server command; the UI never sets status.
 * I01 routes: GET /api/auth/invitations, POST /api/organizations/:id/members/accept.
 * I01 returns no organization name for invites (REQUESTS R-FE05-03), so the view has none.
 */

export type InvitationView = {
  organizationId: string;
  scopes: OrganizationScope[];
  version: number;
};

export interface OrganizationsApi {
  listInvitations(): Promise<ApiResult<InvitationView[]>>;
  acceptInvitation(organizationId: string, expectedVersion: number): Promise<ApiResult<{ membershipId: string }>>;
}

const inviteRowsSchema = z.object({
  invitations: z
    .array(
      z.object({
        organization_id: z.uuid(),
        // Unknown scope strings are dropped, never shown as granted.
        scopes: z.array(z.string()),
        version: z.int().positive(),
      }),
    )
    .max(200),
});

const knownScopes = (scopes: string[]): OrganizationScope[] =>
  scopes.flatMap((s) => {
    const parsed = organizationScopeSchema.safeParse(s);
    return parsed.success ? [parsed.data] : [];
  });

const acceptInputSchema = z.strictObject({ organizationId: z.uuid(), expectedVersion: z.int().positive() });

export function createHttpOrganizationsApi(options: HttpAdapterOptions = {}): OrganizationsApi {
  const client = createJsonClient(options);
  return {
    async listInvitations() {
      const r = await client.request({ method: "GET", path: "/api/auth/invitations", schema: inviteRowsSchema });
      if (!r.ok) return toApiResult(r);
      return ok(r.data.invitations.map((i) => ({ organizationId: i.organization_id, scopes: knownScopes(i.scopes), version: i.version })));
    },
    async acceptInvitation(organizationId, expectedVersion) {
      const valid = validateInput(acceptInputSchema, { organizationId, expectedVersion });
      if (!valid.ok) return valid.result;
      const r = await client.request({
        method: "POST",
        path: `/api/organizations/${valid.data.organizationId}/members/accept`,
        body: { expectedVersion: valid.data.expectedVersion },
        schema: z.object({ membershipId: z.uuid() }),
      });
      return r.ok ? ok({ membershipId: r.data.membershipId }) : toApiResult(r);
    },
  };
}

/** Synthetic invitations (placeholder IDs). Not real organizations. */
const FIXTURE_INVITES: readonly InvitationView[] = [
  { organizationId: "00000000-0000-4000-8000-000000030001", scopes: ["org:read", "provider:read"], version: 1 },
];

export function createFixtureOrganizationsApi(options: FixtureOptions = {}): OrganizationsApi {
  assertFixtureAllowed(options.env);
  const pending = new Map(FIXTURE_INVITES.map((i) => [i.organizationId, structuredClone(i)]));
  return {
    async listInvitations() {
      return ok([...pending.values()].map((i) => structuredClone(i)));
    },
    async acceptInvitation(organizationId, expectedVersion) {
      const valid = validateInput(acceptInputSchema, { organizationId, expectedVersion });
      if (!valid.ok) return valid.result;
      const invite = pending.get(valid.data.organizationId);
      // Revoked/unknown invite: no detail about whether the organization exists.
      if (!invite) return fail("not_found");
      if (invite.version !== valid.data.expectedVersion) return fail("conflict");
      pending.delete(valid.data.organizationId);
      return ok({ membershipId: crypto.randomUUID() });
    },
  };
}

export function getOrganizationsApi(
  options: { env?: Record<string, string | undefined>; http?: HttpAdapterOptions; fixture?: Omit<FixtureOptions, "env"> } = {},
): OrganizationsApi {
  const env = options.env ?? process.env;
  return getAdapterMode(env) === "fixture"
    ? createFixtureOrganizationsApi({ ...options.fixture, env })
    : createHttpOrganizationsApi(options.http);
}
