import { chromium } from "@playwright/test";
const base = "http://127.0.0.1:" + process.env.PROBE_PORT;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
for (const p of (process.env.PROBE_PATHS ?? "").split(",").filter(Boolean)) {
  errors.length = 0;
  const res = await page.goto(base + p, { waitUntil: "load", timeout: 60000 }); await page.waitForTimeout(1500); void (0);
  const info = await page.evaluate(() => ({
    url: location.pathname + location.search,
    h1: document.querySelector("h1")?.textContent?.trim() ?? "",
    gates: [...document.querySelectorAll("[data-gate]")].map(e => e.getAttribute("data-gate") + ": " + (e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 110)),
    alert: [...document.querySelectorAll('[role="alert"]')].map(e => (e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 110)),
    synthetic: document.body.innerText.includes("Synthetic data, not live"),
    robots: document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "",
    storage: localStorage.length + sessionStorage.length,
    main: (document.querySelector("main")?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 330),
  }));
  console.log(`${res?.status()} ${p} -> ${info.url}\n   h1="${info.h1}" robots=${info.robots} synthetic=${info.synthetic} storage=${info.storage}\n   gates=${JSON.stringify(info.gates)}\n   alerts=${JSON.stringify(info.alert)} consoleErrors=${errors.length}\n   main="${info.main}"`);
}
await browser.close();
