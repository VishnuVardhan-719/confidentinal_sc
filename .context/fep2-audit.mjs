// R8 usability audit for public pages: touch targets, clipped/overflowing text, script line-height, focus visibility.
import { chromium } from "@playwright/test";
const base = process.env.BASE ?? "http://localhost:3330";
const locales = (process.env.LOCALES ?? "te,hi").split(",");
const widths = (process.env.WIDTHS ?? "390,768,1280").split(",").map(Number);
const routes = (process.env.ROUTES ?? ",/about,/our-story,/stories,/how-it-works,/faq,/contact,/privacy,/terms,/refunds,/become-a-provider,/memberships,/emergency,/doctors,/no-such-page").split(",");
const focusTabs = Number(process.env.TABS ?? 25);
const browser = await chromium.launch();
const seen = new Map();
const add = (key, where) => { if (!seen.has(key)) seen.set(key, []); seen.get(key).push(where); };
for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  for (const l of locales) {
    for (const r of routes) {
      await page.goto(`${base}/${l}${r}`);
      await page.waitForTimeout(250);
      const found = await page.evaluate(() => {
        const out = [];
        const desc = (el) => {
          const id = el.id ? "#" + el.id : "";
          const cls = String(el.className || "").split(" ").filter(Boolean).slice(0, 4).join(".");
          return `${el.tagName.toLowerCase()}${id}${cls ? "." + cls : ""} "${(el.innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 30)}"`;
        };
        const visible = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== "hidden" && !el.closest("[aria-hidden=true],.sr-only"); };
        // Touch targets (non-inline). Inline links inside running text are reported separately.
        for (const el of document.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=menuitem]")) {
          if (!visible(el)) continue;
          if (el.matches("input[type=radio],input[type=checkbox]") && el.closest("label")) continue;
          const b = el.getBoundingClientRect();
          const inline = getComputedStyle(el).display === "inline" && el.closest("p,li,dd,td");
          if (b.height < 43.5 || b.width < 43.5) out.push(`${inline ? "target-inline" : "target"} ${Math.round(b.width)}x${Math.round(b.height)} ${desc(el)}`);
        }
        // Clipped / overflowing text: element content wider than its box, or ellipsis truncation.
        for (const el of document.querySelectorAll("body *")) {
          if (!visible(el) || el.children.length > 6) continue;
          const cs = getComputedStyle(el);
          const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          if (!hasText) continue;
          if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && cs.overflowX !== "visible") out.push(`clipped ${el.scrollWidth}>${el.clientWidth} ${desc(el)}`);
          else if (cs.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1) out.push(`ellipsis ${desc(el)}`);
          const pb = el.parentElement?.getBoundingClientRect(); const b = el.getBoundingClientRect();
          if (pb && cs.display !== "inline" && b.right > pb.right + 2 && getComputedStyle(el.parentElement).overflowX === "visible" && cs.position === "static") out.push(`spills ${Math.round(b.right - pb.right)}px ${desc(el)}`);
          // Script line-height: matras/vowel signs need >= 1.4 for body text, >= 1.25 for headings/controls.
          const fs = parseFloat(cs.fontSize); const lh = cs.lineHeight === "normal" ? fs * 1.2 : parseFloat(cs.lineHeight);
          const lines = Math.round(b.height / lh);
          const min = el.matches("h1,h2,h3,h4,button,a,label,summary,dt,th") ? 1.25 : 1.4;
          if (lines >= 2 && lh / fs < min - 0.01) out.push(`line-height ${(lh / fs).toFixed(2)} (${lines} lines) ${desc(el)}`);
        }
        return out;
      });
      for (const f of found) add(f, `${l}${r || "/"}@${width}`);
      // Focus visibility for the first N tab stops.
      await page.evaluate(() => document.activeElement?.blur());
      for (let i = 0; i < focusTabs; i++) {
        await page.keyboard.press("Tab");
        const f = await page.evaluate(() => {
          const el = document.activeElement; if (!el || el === document.body) return null;
          const cs = getComputedStyle(el);
          const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2) || (cs.boxShadow && cs.boxShadow !== "none");
          const b = el.getBoundingClientRect();
          const off = b.bottom < 0 || b.top > innerHeight || b.right < 0 || b.left > innerWidth;
          const header = document.querySelector("header");
          const hb = header && getComputedStyle(header).position === "sticky" ? header.getBoundingClientRect().bottom : 0;
          const under = !el.closest("header") && cs.position !== "fixed" && b.top < hb - 1;
          if (ring && !off && !under) return null;
          return `${!ring ? "focus-invisible" : off ? "focus-offscreen" : "focus-under-header"} ${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 30)}"`;
        });
        if (f) add(f, `${l}${r || "/"}@${width}`);
      }
    }
  }
  await page.close();
}
await browser.close();
const rows = [...seen.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [k, w] of rows) console.log(`${String(w.length).padStart(3)}x ${k}  e.g. ${w.slice(0, 3).join(", ")}`);
console.log("unique issues:", rows.length);
