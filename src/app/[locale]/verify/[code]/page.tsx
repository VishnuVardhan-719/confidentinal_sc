import { redirect } from "next/navigation";
import { connection } from "next/server";
import { InlineError } from "@/components/shared/inline-error";
import { RetryAction } from "@/components/shared/retry-action";
import { ProofCheckResultView, ProofCodeForm } from "@/components/proof-of-visit/proof-check";
import { VerifyPageFrame, verifyMetadata } from "@/components/proof-of-visit/verify-page";
import { isClinicalEnabled } from "@/modules/clinical/gate";
import { getProofCheckApi, normalizeProofCode } from "@/modules/proof-of-visit";

export const generateMetadata = verifyMetadata;

const toLocale = (l: string) => (l === "te" || l === "hi" ? l : "en");

/**
 * DC12 public proof-of-visit check. Unauthenticated. Shows valid / expired / revoked / unknown with
 * the approved minimum only. Malformed codes are "unknown" without any lookup.
 */
export default async function VerifyCodePage({ params }: PageProps<"/[locale]/verify/[code]">) {
  await connection();
  const { locale: raw, code: rawCode } = await params;
  const locale = toLocale(raw);
  const decoded = safeDecode(rawCode);
  const code = normalizeProofCode(decoded);
  // One canonical URL per code (lowercase, no separators).
  if (code && code !== rawCode) redirect(`/${locale}/verify/${code}`);

  if (!isClinicalEnabled()) return <VerifyPageFrame>{null}</VerifyPageFrame>;

  const r = code ? await getProofCheckApi().check(code) : ({ ok: true, data: { status: "unknown" } } as const);
  return (
    <VerifyPageFrame>
      {r.ok ? (
        <ProofCheckResultView result={r.data} code={code} />
      ) : (
        <InlineError code={r.error.code} action={r.error.code === "unavailable" ? <RetryAction /> : undefined} />
      )}
      <ProofCodeForm locale={locale} />
    </VerifyPageFrame>
  );
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return "";
  }
}
