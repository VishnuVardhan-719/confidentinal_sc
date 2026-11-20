import { endpoint, input, json, session } from "@/lib/auth/http";
import { requestKey, routeId } from "@/lib/catalog/http";
import { careCommand } from "@/lib/care/service";
import { careTasksSchema } from "@/lib/validation/care";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const { db } = await session(request);
    const id = await routeId(context);
    const key = requestKey(request);
    const v = await input(request, careTasksSchema);
    return json({ version: await careCommand(db, "set_care_service_tasks", { p_service_id: id, p_task_codes: v.taskCodes,
      p_expected_version: v.expectedVersion, p_request_key: key }) });
  });
}
