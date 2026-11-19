// Removes named imports that are no longer referenced in the file body (one-off, fe-int2).
import { readFileSync, writeFileSync } from "node:fs";
const NAMES = ["getPatientSession", "patientLoginRedirect", "redirect"];
for (const f of process.argv.slice(2)) {
  let s = readFileSync(f, "utf8");
  for (const name of NAMES) {
    const body = s.replace(/^import [^;]+;$/gm, "");
    if (new RegExp(`\\b${name}\\b`).test(body)) continue;
    s = s.replace(/^import \{([^}]*)\} from ("[^"]+");\r?\n/gm, (line, names, from) => {
      const list = names.split(",").map((n) => n.trim()).filter(Boolean);
      if (!list.includes(name)) return line;
      const rest = list.filter((n) => n !== name);
      return rest.length ? `import { ${rest.join(", ")} } from ${from};\n` : "";
    });
  }
  writeFileSync(f, s);
}
