import { describe, expect, it } from "vitest";
import { assertLocalDocker, assertScratchDatabase, orderedSqlFiles } from "../../scripts/rls-all.mjs";

describe("RLS runner pure guards", () => {
  it("orders SQL filenames and excludes runner helpers and other files", () => {
    expect(orderedSqlFiles(["004_z.sql", "002_b.sql", "001_a.sql", "x_runner.sql", "run_i01_followups.py", "README.md"]))
      .toEqual(["001_a.sql", "002_b.sql", "004_z.sql"]);
  });
  it("accepts only local Docker endpoints and the running named container", () => {
    for (const endpoint of ["unix:///var/run/docker.sock", "npipe:////./pipe/docker_engine"]) {
      expect(() => assertLocalDocker({}, "default", endpoint, { Name: "/supabase_db_surecurevisit", State: { Running: true } })).not.toThrow();
    }
  });
  it.each([
    [{ DOCKER_HOST: "ssh://production" }, "default", "unix:///var/run/docker.sock", true, "/supabase_db_surecurevisit"],
    [{ DOCKER_HOST: "npipe:////remote-host/pipe/docker_engine" }, "default", "unix:///var/run/docker.sock", true, "/supabase_db_surecurevisit"],
    [{ DOCKER_HOST: "tcp://127.0.0.1:2375" }, "default", "unix:///var/run/docker.sock", true, "/supabase_db_surecurevisit"],
    [{ DOCKER_CONTEXT: "production" }, "default", "unix:///var/run/docker.sock", true, "/supabase_db_surecurevisit"],
    [{}, "production", "unix:///var/run/docker.sock", true, "/supabase_db_surecurevisit"],
    [{}, "default", "ssh://production", true, "/supabase_db_surecurevisit"],
    [{}, "default", "npipe:////remote-host/pipe/docker_engine", true, "/supabase_db_surecurevisit"],
    [{}, "default", "unix://remote-host/socket", true, "/supabase_db_surecurevisit"],
    [{}, "default", "unix:///var/run/docker.sock", false, "/supabase_db_surecurevisit"],
    [{}, "default", "unix:///var/run/docker.sock", true, "/supabase_db_other"],
  ])("refuses unsafe Docker configuration %#", (env, context, endpoint, running, name) => {
    expect(() => assertLocalDocker(env, context, endpoint, { Name: name, State: { Running: running } })).toThrow();
  });
  it("permits only generated scratch database identifiers", () => {
    expect(() => assertScratchDatabase("rls_all_0123456789abcdef01234567")).not.toThrow();
    for (const name of ["postgres", "template0", "rls_all_bad", 'rls_all_";drop database postgres;--']) {
      expect(() => assertScratchDatabase(name)).toThrow();
    }
  });
});
