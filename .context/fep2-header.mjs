// Measure public header pieces per locale/width.
import { chromium } from "@playwright/test";
const base = process.env.BASE ?? "http://localhost:3330";
const widths = (process.env.WIDTHS ?? "1280,1536").split(",").map(Number);
const browser = await chromium.launch();
for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  for (const l of ["en", "te", "hi"]) {
    await page.goto(`${base}/${l}`);
    const r = await page.evaluate(() => {
      const row = document.querySelector("header > div");
      const w = (el) => (el ? Math.round(el.getBoundingClientRect().width) : 0);
      const kids = [...row.children].map((c) => `${c.tagName.toLowerCase()}:${w(c)}`);
      const right = row.querySelector(":scope > div.ml-auto");
      const rk = right ? [...right.children].map((c) => `${(c.textContent || c.getAttribute("aria-label") || "").trim().slice(0, 14)}:${w(c)}`) : [];
      return { row: w(row), kids, rk };
    });
    console.log(width, l, "row", r.row, r.kids.join(" "), "| right:", r.rk.join(" | "));
  }
  await page.close();
}
await browser.close();
