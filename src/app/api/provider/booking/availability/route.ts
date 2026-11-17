import { endpoint, input, json, session } from "@/lib/auth/http";
import { bookingCommand } from "@/lib/booking/service";
import { availabilityRuleSchema } from "@/lib/validation/booking";

export async function POST(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const v = await input(request, availabilityRuleSchema);
    return json({ id: await bookingCommand(db, "set_booking_availability", { p_provider_id: v.providerId, p_resource_id: v.resourceId,
      p_weekday: v.weekday, p_local_start: v.localStart, p_local_end: v.localEnd, p_effective_from: v.effectiveFrom,
      p_effective_to: v.effectiveTo, p_expected_version: v.expectedVersion, p_rule_id: v.ruleId ?? null }) }, v.ruleId ? 200 : 201);
  });
}
