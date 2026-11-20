/* eslint-disable -- local Node audit script (CommonJS), not app code */
const { execSync } = require("child_process");
const g = "C:/Users/Yashwanth/fe2-int";
const sh = c => execSync(c, { cwd: g, encoding: "utf8", maxBuffer: 64 << 20 });
const files = sh("git ls-tree -r --name-only HEAD -- src").split("\n").filter(f => /\.tsx$/.test(f));
const out = [];
for (const f of files) {
  const text = sh(`git show "HEAD:${f}"`);
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (/^\s*(\*|\/\/|\/\*)/.test(line)) return;
    if (/^\s+[A-Z][a-z]+( [a-zA-Z,.'-]+){2,}\s*$/.test(line)) out.push(`${f}:${i + 1}: line "${line.trim()}"`);
    for (const m of line.matchAll(/(?<![=\-])>\s*([A-Za-z][A-Za-z ,.'!?:-]{2,})\s*</g)) out.push(`${f}:${i + 1}: text "${m[1].trim()}"`);
    for (const m of line.matchAll(/\b(aria-label|title|placeholder|alt|label)="([A-Za-z][^"]{1,})"/g)) out.push(`${f}:${i + 1}: ${m[1]}="${m[2]}"`);
  });
}
console.log(out.length + " hits"); console.log(out.join("\n"));

