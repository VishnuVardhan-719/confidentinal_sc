import { endpoint, input, json, session } from "@/lib/auth/http";
import { bookingCommand } from "@/lib/booking/service";
import { addressSchema } from "@/lib/validation/booking";

export async function POST(request: Request) {
  return endpoint(async () => {
    const { db } = await session(request);
    const v = await input(request, addressSchema);
    const id = await bookingCommand(db, "save_patient_address", { p_patient_id: v.patientId, p_line1: v.line1, p_locality: v.locality,
      p_pin: v.pin, p_contact_name: v.contactName, p_phone: v.phone, p_expected_version: v.expectedVersion, p_address_id: v.addressId ?? null });
    return json({ id }, v.addressId ? 200 : 201);
  });
}
