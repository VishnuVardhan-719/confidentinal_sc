/**
 * Synthetic workspace servers for the doctor/patient e2e specs.
 *
 * The interim doctor/patient sessions are chosen by SERVER env vars in fixture mode
 * (src/modules/doctor/session.ts, src/modules/patient-dashboard/session.ts), so "signing in as"
 * an actor means talking to the server started with that actor. Each viewport project gets its
 * own set of servers because the fixture world is process-wide and the specs mutate it.
 * All servers share one production build (`next build` runs once in the first webServer).
 */
export type WorkspaceServer = "assigned" | "other" | "anon" | "gateOff";
export type WorkspaceProject = "ws-desktop-1280" | "ws-mobile-390";

export const WS_BASE_PORT = Number(process.env.E2E_WS_PORT ?? 3370);

const OFFSET: Record<WorkspaceServer, number> = { assigned: 0, other: 1, anon: 2, gateOff: 3 };
const PROJECT_OFFSET: Record<WorkspaceProject, number> = { "ws-desktop-1280": 0, "ws-mobile-390": 10 };

export function wsPort(project: WorkspaceProject, server: WorkspaceServer): number {
  return WS_BASE_PORT + PROJECT_OFFSET[project] + OFFSET[server];
}

export function wsOrigin(project: string, server: WorkspaceServer): string {
  if (project !== "ws-desktop-1280" && project !== "ws-mobile-390") throw new Error(`not a workspace project: ${project}`);
  return `http://localhost:${wsPort(project, server)}`;
}

/** Server env per actor. Synthetic fixture adapter only; never APP_ENV=production. */
export function wsEnv(server: WorkspaceServer): Record<string, string> {
  const common = { FRONTEND_ADAPTER: "fixture", NEXT_TELEMETRY_DISABLED: "1", FIXTURE_BOOKING_SCENARIO: "accepted" };
  switch (server) {
    case "assigned":
      return { ...common, FEATURE_CLINICAL: "true", FIXTURE_DOCTOR_SESSION: "assigned", FIXTURE_PATIENT_SESSION: "self" };
    case "other":
      return { ...common, FEATURE_CLINICAL: "true", FIXTURE_DOCTOR_SESSION: "other" };
    case "anon":
      return { ...common, FEATURE_CLINICAL: "true" };
    case "gateOff":
      return { ...common, FIXTURE_DOCTOR_SESSION: "assigned", FIXTURE_PATIENT_SESSION: "self" };
  }
}

export const WS_SERVERS: WorkspaceServer[] = ["assigned", "other", "anon", "gateOff"];
export const WS_PROJECTS: WorkspaceProject[] = ["ws-desktop-1280", "ws-mobile-390"];
