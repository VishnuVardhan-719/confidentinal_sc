"use server";

import { fail, type ApiResult } from "@/lib/api/result";
import { getFamilyMembersApi, type FamilyMember } from "@/modules/family-members";
import { getPatientSession } from "@/modules/patient-dashboard/session";

/**
 * Family member mutations. Each call re-resolves the interim patient session and builds a fresh API;
 * the adapter (and the backend) re-validate input, ownership and versions. Nothing is logged.
 */
function api() {
  const session = getPatientSession();
  return session.status === "ok" ? getFamilyMembersApi(process.env, session.fixtureActor) : null;
}

async function run<T>(fn: (a: NonNullable<ReturnType<typeof api>>) => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  const a = api();
  if (!a) return fail("unauthenticated");
  try {
    return await fn(a);
  } catch {
    return fail("unavailable");
  }
}

export async function createFamilyMemberAction(input: unknown, idempotencyKey: string): Promise<ApiResult<FamilyMember>> {
  return run((a) => a.create(input, idempotencyKey));
}

export async function updateFamilyMemberAction(memberId: string, input: unknown, expectedVersion: number): Promise<ApiResult<FamilyMember>> {
  return run((a) => a.update(memberId, input, expectedVersion));
}

export async function removeFamilyMemberAction(memberId: string, expectedVersion: number): Promise<ApiResult<{ id: string }>> {
  return run((a) => a.remove(memberId, expectedVersion));
}
