import { redirect } from "next/navigation";
import { currentLocale } from "@/components/admin/ops/server";

/** /{locale}/lab -> the lab dashboard (auth module home route). */
export default async function LabIndex() {
  redirect(`/${await currentLocale()}/lab/dashboard`);
}