import { describe, expect, it } from "vitest";
import { launchSplashEnabled } from "@/components/public/launch-splash-config";

describe("launchSplashEnabled", () => {
  it("is on for staging and production, off for development and tests", () => {
    expect(launchSplashEnabled({ APP_ENV: "staging" })).toBe(true);
    expect(launchSplashEnabled({ APP_ENV: "production" })).toBe(true);
    expect(launchSplashEnabled({ APP_ENV: "development" })).toBe(false);
    expect(launchSplashEnabled({ APP_ENV: "test" })).toBe(false);
    expect(launchSplashEnabled({})).toBe(false);
  });
  it("can be forced either way with LAUNCH_SPLASH", () => {
    expect(launchSplashEnabled({ APP_ENV: "test", LAUNCH_SPLASH: "on" })).toBe(true);
    expect(launchSplashEnabled({ APP_ENV: "production", LAUNCH_SPLASH: "off" })).toBe(false);
  });
});
