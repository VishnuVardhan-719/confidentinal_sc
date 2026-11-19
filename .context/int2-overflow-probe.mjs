// fe-int2: find elements wider than the viewport on one page (synthetic fixture account).
// Usage: node .context/int2-overflow-probe.mjs <email|-> <path> [width]
import { chromium } from "@playwright/test";
const [email, path, width = "1280"] = process.argv.slice(2);
const base = "http://localhost:3320";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } });
if (email && email !== "-") {
  await page.goto(`${base}/en/login`);
  await page.getByRole("textbox", { name: /email/i }).filter({ visible: true }).first().fill(email);
  await page.locator('input[type="password"]').filter({ visible: true }).first().fill("fixture-password");
  await page.getByRole("button", { name: /^sign in$/i }).filter({ visible: true }).first().click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"));
}
await page.goto(base + path, { waitUntil: "networkidle" });
const report = await page.evaluate(() => {
  const vw = window.innerWidth;
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && r.width > 0) out.push({ tag: el.tagName, cls: String(el.className).slice(0, 90), right: Math.round(r.right), w: Math.round(r.width), text: (el.textContent || "").trim().slice(0, 50) });
  }
  return { vw, scroll: document.documentElement.scrollWidth, items: out.slice(-12) };
});
console.log(JSON.stringify(report, null, 1));
await browser.close();
