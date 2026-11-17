import { endpoint, input, json, session } from "@/lib/auth/http";
import { command } from "@/lib/auth/identity";
import { selfPatientSchema } from "@/lib/validation/identity";

// Identity access consent only; questionnaire/onboarding is a separate later command.
export async function POST(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const value = await input(request, selfPatientSchema);
    return json({ patientId: await command(db, "create_self_patient", { p_policy_version: value.policyVersion }) });
  });
}
