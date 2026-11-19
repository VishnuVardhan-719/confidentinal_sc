// Resolve git conflict markers by keeping both sides (ours then theirs).
import { readFileSync, writeFileSync } from "node:fs";
for (const f of process.argv.slice(2)) {
  const src = readFileSync(f, "utf8");
  const out = src
    .split(/\r?\n/)
    .filter((l) => !/^(<<<<<<< |=======$|>>>>>>> |\|\|\|\|\|\|\| )/.test(l))
    .join("\n");
  writeFileSync(f, out);
  console.log("resolved", f);
}
