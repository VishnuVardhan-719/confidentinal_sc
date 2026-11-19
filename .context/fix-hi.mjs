import { readFileSync, writeFileSync } from "node:fs";
const p = ".context/booking-strings-hi.json";
let s = readFileSync(p, "utf8");
s = s.replace(/"confirmMove": "[^"]*"/, '"confirmMove": "\u0928\u092F\u093E \u0938\u092E\u092F \u092D\u0947\u091C\u0947\u0902"');
writeFileSync(p, s);
for (const l of ["te", "hi"]) {
  const t = readFileSync(`.context/booking-strings-${l}.json`, "utf8");
  if (t.includes("\uFFFD")) console.log("BAD", l);
  JSON.parse(t);
}
console.log("checked");
