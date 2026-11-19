import type { RequestLine } from "@/modules/service-requests/core";
import type { LabProvider } from "./types";

/**
 * Price lines for a lab order from the lab's own catalogue: one line per chosen test plus the home collection
 * fee. Used by the server for the stored snapshot and by the form only to show the same figure before sending.
 */
export function labLines(provider: Pick<LabProvider, "tests" | "collectionFeePaise">, testIds: readonly string[]): RequestLine[] | "validation" {
  const lines: RequestLine[] = [];
  for (const id of testIds) {
    const test = provider.tests.find(item => item.id === id.toLowerCase());
    if (!test) return "validation";
    lines.push({ key: `test:${test.id}`, label: test.name, quantity: 1, unitPaise: test.pricePaise, amountPaise: test.pricePaise });
  }
  if (lines.length === 0) return "validation";
  lines.push({ key: "collection", label: "Home collection", quantity: 1, unitPaise: provider.collectionFeePaise, amountPaise: provider.collectionFeePaise });
  return lines;
}
