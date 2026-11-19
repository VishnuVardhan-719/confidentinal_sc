// Find elements wider than the viewport (or extending past its right edge) on given pages.
import { chromium } from "@playwright/test";
const base = process.env.BASE ?? "http://localhost:3330";
const widths = (process.env.WIDTHS ?? "390,768,1280").split(",").map(Number);
const paths = (process.argv[2] ?? "/te,/hi,/en").split(",");
const browser = await chromium.launch();
for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  for (const p of paths) {
    await page.goto(base + p);
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const overflow = document.documentElement.scrollWidth - vw;
      const offenders = [];
      for (const el of document.querySelectorAll("body *")) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        if (b.right > vw + 0.5 || b.left < -0.5) {
          // only report the outermost offenders whose parent does not also overflow
          const pb = el.parentElement?.getBoundingClientRect();
          if (pb && (pb.right > vw + 0.5 || pb.left < -0.5)) continue;
          const cs = getComputedStyle(el);
          if (cs.position === "fixed" && cs.visibility === "hidden") continue;
          offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 90)} [${Math.round(b.left)}..${Math.round(b.right)}] "${(el.textContent ?? "").trim().slice(0, 40)}"`);
        }
      }
      return { overflow, offenders: offenders.slice(0, 8) };
    });
    console.log(`${width} ${p} overflow=${r.overflow}`);
    for (const o of r.offenders) console.log("   ", o);
  }
  await page.close();
}
await browser.close();
