import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { dcxCommand } from "@/lib/doctor-extras/service";
import { factReviseSchema } from "@/lib/validation/doctor-extras";

// DC11: appends a new version; reviews of the old version stay linked to it.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, factReviseSchema);
    return json({ version: await dcxCommand(db, "revise_health_fact", { p_fact_id: id, p_statement: v.statement, p_expected_version: v.expectedVersion, p_request_key: key }) });
  });
}
