import { tripStepRoute } from "@/lib/ambulance/http";

// Driver milestone; the step is fixed here, never read from the request.
export const POST = tripStepRoute("interrupt");
