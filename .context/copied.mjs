import { readFileSync } from "node:fs";
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => typeof v === "string" ? [[p + k, v]] : flat(v, p + k + "."));
for (const ns of ["onboarding", "patient"]) {
  const en = Object.fromEntries(flat(JSON.parse(readFileSync(`src/messages/en/${ns}.json`, "utf8"))));
  for (const l of ["te", "hi"]) {
    const o = Object.fromEntries(flat(JSON.parse(readFileSync(`src/messages/${l}/${ns}.json`, "utf8"))));
    const c = Object.keys(o).filter((k) => o[k] === en[k]);
    console.log(l, ns, c.length, "of", Object.keys(o).length, c.slice(0, 5).join(","));
  }
}
