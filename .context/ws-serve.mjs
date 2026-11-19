// Local helper (not committed): start the workspace fixture servers on the current build.
import { spawn } from "node:child_process";
const { WS_PROJECTS, WS_SERVERS, wsEnv, wsPort } = await import("../tests/e2e/workspace-servers.ts");
const only = process.argv[2]; // optional project filter
const procs = [];
for (const p of WS_PROJECTS) {
  if (only && p !== only) continue;
  for (const s of WS_SERVERS) {
    const port = wsPort(p, s);
    const child = spawn("npx", ["next", "start", "-p", String(port)], { env: { ...process.env, ...wsEnv(s) }, stdio: "ignore", shell: true });
    procs.push(child);
    console.log(`${p}/${s} -> ${port} pid ${child.pid}`);
  }
}
const publicPort = process.env.E2E_PORT;
if (publicPort) procs.push(spawn("npx", ["next", "start", "-p", publicPort], { stdio: "ignore", shell: true }));
process.on("SIGINT", () => { for (const c of procs) c.kill(); process.exit(0); });
setInterval(() => {}, 1 << 30);
