import { readFileSync, writeFileSync } from "node:fs";
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => typeof v === "string" ? [[p + k, v]] : flat(v, p + k + "."));
const out = {};
for (const ns of ["onboarding", "patient"]) {
  const en = Object.fromEntries(flat(JSON.parse(readFileSync(`src/messages/en/${ns}.json`, "utf8"))));
  const o = Object.fromEntries(flat(JSON.parse(readFileSync(`src/messages/te/${ns}.json`, "utf8"))));
  out[ns] = Object.fromEntries(Object.keys(o).filter((k) => o[k] === en[k]).map((k) => [k, en[k]]));
}
writeFileSync(".context/to-translate.json", JSON.stringify(out, null, 2));
