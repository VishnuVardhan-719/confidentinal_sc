import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ProofCodeForm } from "@/components/proof-of-visit/proof-check";
import { VerifyPageFrame, verifyMetadata } from "@/components/proof-of-visit/verify-page";
import { normalizeProofCode } from "@/modules/proof-of-visit";

export const generateMetadata = verifyMetadata;

const toLocale = (l: string) => (l === "te" || l === "hi" ? l : "en");

/** Code entry. `?code=` comes from the no-JS form; a valid code redirects to its result page. */
export default async function VerifyEntryPage({ params, searchParams }: PageProps<"/[locale]/verify">) {
  await connection();
  const [{ locale: raw }, sp] = await Promise.all([params, searchParams]);
  const locale = toLocale(raw);
  const typed = typeof sp.code === "string" ? sp.code : undefined;
  if (typed !== undefined) {
    const code = normalizeProofCode(typed);
    if (code) redirect(`/${locale}/verify/${code}`);
  }
  const t = await getTranslations("verify.form");
  const error = typed === undefined ? undefined : typed.trim() === "" ? t("required") : t("invalid");
  return (
    <VerifyPageFrame>
      {/* Never echo an invalid code back into the field or URL beyond what the user typed. */}
      <ProofCodeForm locale={locale} defaultValue={typed?.slice(0, 80)} error={error} />
    </VerifyPageFrame>
  );
}
