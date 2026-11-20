import { connection } from "next/server";
import { endpoint, json } from "@/lib/auth/http";
import { routeId } from "@/lib/catalog/http";
import { careCommand } from "@/lib/care/service";
import { publicAuthClient } from "@/lib/db/request-client";

type Tasks = { service_id: string; task_codes: string[]; version: number; bookable: boolean };

// Guest read: no session. bookable reflects the database gate (contract §10.1).
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    await connection();
    const id = await routeId(context);
    const t = await careCommand(publicAuthClient(), "get_care_service_tasks", { p_service_id: id }) as Tasks;
    return json({ serviceId: t.service_id, taskCodes: t.task_codes, version: t.version, bookable: t.bookable });
  });
}
