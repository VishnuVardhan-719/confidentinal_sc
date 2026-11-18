import { redirect } from "next/navigation";
import { currentLocale } from "@/components/admin/ops/server";

export default async function AdminIndex() {
  redirect(`/${await currentLocale()}/admin/dashboard`);
}