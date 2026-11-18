import { redirect } from "next/navigation";
import { currentLocale } from "@/components/admin/ops/server";

export default async function AmbulanceIndex() {
  redirect(`/${await currentLocale()}/ambulance/dashboard`);
}