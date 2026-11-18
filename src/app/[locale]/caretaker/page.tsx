import { redirect } from "next/navigation";
import { currentLocale } from "@/components/admin/ops/server";

export default async function CaretakerIndex() {
  redirect(`/${await currentLocale()}/caretaker/dashboard`);
}