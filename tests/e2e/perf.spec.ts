import { expect, test } from "@playwright/test";

/**
 * Lab performance indicators for public pages on a throttled mobile profile (Chromium CDP:
 * 1.6 Mbps down, 150 ms RTT, 4x CPU slowdown). These are development lab numbers, not real-user
 * Core Web Vitals. Budgets: CLS < 0.1, LCP < 4 s under this throttle, JS transferred < 350 KB.
 */
const PAGES = ["/en", "/te", "/en/faq", "/en/emergency"];

// Measure one page at a time so parallel workers do not distort the throttled numbers.
test.describe.configure({ mode: "serial" });

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "perf runs on the mobile profile only");
  // Lab numbers are only meaningful on an otherwise idle machine: run alone with E2E_PERF=1 --workers=1.
  test.skip(process.env.E2E_PERF !== "1", "set E2E_PERF=1 to measure");
});

for (const path of PAGES) {
  test(`lab metrics ${path}`, async ({ page, context }) => {
    test.setTimeout(120_000);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    // Bytes on the wire (compressed), per CDP.
    let jsBytes = 0;
    let totalBytes = 0;
    const scripts = new Set<string>();
    cdp.on("Network.responseReceived", (e: { requestId: string; type: string }) => {
      if (e.type === "Script") scripts.add(e.requestId);
    });
    cdp.on("Network.loadingFinished", (e: { encodedDataLength: number; requestId: string }) => {
      totalBytes += e.encodedDataLength;
      if (scripts.has(e.requestId)) jsBytes += e.encodedDataLength;
    });

    await page.addInitScript(() => {
      const w = window as unknown as { __lcp: number; __cls: number };
      w.__lcp = 0;
      w.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__lcp = e.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      // CLS = largest session window: shifts less than 1 s apart, window capped at 5 s (web-vitals definition).
      let sessionValue = 0;
      let sessionStart = 0;
      let lastShift = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          if (e.hadRecentInput) continue;
          if (sessionValue > 0 && e.startTime - lastShift < 1000 && e.startTime - sessionStart < 5000) {
            sessionValue += e.value;
          } else {
            sessionValue = e.value;
            sessionStart = e.startTime;
          }
          lastShift = e.startTime;
          w.__cls = Math.max(w.__cls, sessionValue);
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

    await page.goto(path, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const { lcp, cls, fcp } = await page.evaluate(() => {
      const w = window as unknown as { __lcp: number; __cls: number };
      const paint = performance.getEntriesByName("first-contentful-paint")[0];
      return { lcp: w.__lcp, cls: w.__cls, fcp: paint ? paint.startTime : 0 };
    });

    const summary = `FCP ${Math.round(fcp)} ms, LCP ${Math.round(lcp)} ms, CLS ${cls.toFixed(3)}, JS ${(jsBytes / 1024).toFixed(0)} KB, total ${(totalBytes / 1024).toFixed(0)} KB`;
    console.log(`[perf] ${path}: ${summary}`);
    test.info().annotations.push({ type: "perf", description: summary });
    expect(cls).toBeLessThan(0.1);
    expect(lcp).toBeLessThan(4000);
    expect(jsBytes).toBeLessThan(350 * 1024);
  });
}
