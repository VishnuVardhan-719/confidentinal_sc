import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}
const ambulance = [
  ...files(path.join(root, "src/lib/ambulance")),
  path.join(root, "src/lib/validation/ambulance.ts"),
  ...files(path.join(root, "src/app/api/bookings/transport")),
  ...files(path.join(root, "src/app/api/bookings/[id]/trip")),
  ...files(path.join(root, "src/app/api/provider/ambulance")),
  ...files(path.join(root, "src/app/api/driver")),
  ...files(path.join(root, "src/app/api/ambulance")),
  ...files(path.join(root, "src/app/api/admin/ambulance")),
];

describe("ambulance isolation", () => {
  it("covers the ambulance files", () => {
    expect(ambulance.length).toBeGreaterThan(20);
  });
  it("no ambulance code reads the emergency or GPS flags", () => {
    for (const file of ambulance) expect(readFileSync(file, "utf8"), file).not.toMatch(/emergencyDispatch|FEATURE_EMERGENCY_DISPATCH|\bgps\b|FEATURE_GPS/);
  });
  it("no route uses the dynamic segment config (cacheComponents is on)", () => {
    for (const file of ambulance.filter(f => f.endsWith("route.ts"))) expect(readFileSync(file, "utf8"), file).not.toMatch(/export const (dynamic|revalidate|fetchCache)/);
  });
  it("routes never choose the RPC from the request", () => {
    for (const file of ambulance.filter(f => f.endsWith("route.ts"))) expect(readFileSync(file, "utf8"), file).not.toMatch(/rpc\(\s*(v|body|params|request)\./);
  });
  it("no ambulance route recreates the shared contact or ops routes", () => {
    const routes = files(path.join(root, "src/app/api")).filter(f => f.endsWith("route.ts")).map(f => path.relative(root, f).split(path.sep).join("/"));
    expect(routes.filter(r => /\/trip\/contact\/|\/ops\/ambulance\//.test(r))).toEqual([]);
  });
});
