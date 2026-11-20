import { endpoint, json, session } from "@/lib/auth/http";
import { query } from "@/lib/catalog/http";
import { admissionOpen } from "@/lib/ambulance/http";
import { ambulanceCommand } from "@/lib/ambulance/service";
import { transportSlotsSchema } from "@/lib/validation/ambulance";

export async function GET(request: Request) {
  return endpoint(async () => {
    await admissionOpen();
    const { db } = await session(request);
    const v = query(request, transportSlotsSchema);
    const slots = await ambulanceCommand(db, "list_transport_slots", { p_provider_reference: v.provider, p_service_id: v.service,
      p_date: v.date, p_requirement: v.requirement });
    return json({ slots, advisory: true });
  });
}
