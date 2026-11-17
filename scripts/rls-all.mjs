/** Fresh application migrations and RLS suites on local, disposable Supabase. */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CONTAINER = "supabase_db_surecurevisit";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function orderedSqlFiles(names) {
  return names.filter((name) => name.endsWith(".sql") && !name.endsWith("_runner.sql")).sort();
}

export function assertScratchDatabase(name) {
  if (!/^rls_all_[0-9a-f]{24}$/.test(name)) throw new Error("Refusing non-scratch database name");
}

export function assertLocalDocker(env, context, endpoint, container) {
  const local = (value) => /^(unix:\/\/\/|npipe:\/\/\/\/\.\/pipe\/)/.test(value);
  const allowed = (value) => ["default", "desktop-linux"].includes(value);
  if ((env.DOCKER_HOST && !local(env.DOCKER_HOST)) ||
      (env.DOCKER_CONTEXT && !allowed(env.DOCKER_CONTEXT)) ||
      !allowed(context) || !local(endpoint)) {
    throw new Error("Refusing non-local Docker host/context/endpoint");
  }
  if (container.Name !== `/${CONTAINER}` || container.State?.Running !== true) {
    throw new Error(`Required local container ${CONTAINER} is not running`);
  }
}

function execute(command, args, input) {
  const result = spawnSync(command, args, {
    cwd: ROOT, input, encoding: "utf8", timeout: 120_000, maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message ?? result.stderr?.slice(-4000) ?? result.signal}`);
  }
  return result.stdout;
}

export function main() {
  let database;
  let failed = false;
  const docker = (args, input) => execute("docker", args, input);
  const sql = (statement, db = database, user = "postgres") => {
    if (db !== "postgres") assertScratchDatabase(db);
    return docker(["exec", "-i", CONTAINER, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", db], statement);
  };
  let created = false;
  const cleanup = () => {
    if (!created) return;
    assertScratchDatabase(database);
    sql(`DROP DATABASE "${database}" WITH (FORCE);`, "postgres");
    created = false;
    console.log("PASS cleanup: disposable database dropped");
  };
  const interrupt = () => {
    try { cleanup(); } catch (error) { console.error(`FAIL cleanup: ${error.message}`); }
    process.exit(1);
  };
  try {
    // Reject remote environment overrides before even contacting Docker.
    assertLocalDocker(process.env, "default", "unix:///guard", { Name: `/${CONTAINER}`, State: { Running: true } });
    const context = docker(["context", "show"]).trim();
    const endpoint = docker(["context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}"]).trim();
    const container = JSON.parse(docker(["inspect", CONTAINER]))[0];
    assertLocalDocker(process.env, context, endpoint, container);
    console.log(`PASS local running container: ${CONTAINER}`);
    database = `rls_all_${randomBytes(12).toString("hex")}`;
    assertScratchDatabase(database);
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", interrupt);
    const migrations = orderedSqlFiles(readdirSync(join(ROOT, "supabase/migrations")));
    const suites = orderedSqlFiles(readdirSync(join(ROOT, "tests/rls")));
    if (!migrations.length || !suites.length) throw new Error("No migrations or SQL suites found");
    // Schemas are database-local; roles are cluster-wide. Copy schema ONLY,
    // including managed owners/ACLs, then remove cloned application objects.
    const schema = docker(["exec", CONTAINER, "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only"]);
    sql(`CREATE DATABASE "${database}" TEMPLATE template0;`, "postgres");
    created = true;
    sql(schema, database, "supabase_admin");
    sql(`DROP SCHEMA public CASCADE;
      DO $reset$ DECLARE s record; p record; BEGIN
        FOR s IN SELECT nspname FROM pg_namespace WHERE right(nspname,8)='_private' LOOP
          EXECUTE format('DROP SCHEMA %I CASCADE',s.nspname);
        END LOOP;
        FOR p IN SELECT schemaname,tablename,policyname FROM pg_policies WHERE schemaname='storage' LOOP
          EXECUTE format('DROP POLICY %I ON %I.%I',p.policyname,p.schemaname,p.tablename);
        END LOOP;
      END $reset$;
      CREATE SCHEMA public AUTHORIZATION postgres;
      GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
      GRANT ALL ON SCHEMA public TO postgres,service_role;`, database, "supabase_admin");
    console.log(`PASS fresh disposable application schema: ${database}`);
    for (const name of migrations) {
      sql(readFileSync(join(ROOT, "supabase/migrations", name), "utf8"));
      console.log(`PASS migration ${name}`);
    }
    for (const name of suites) {
      try {
        sql(readFileSync(join(ROOT, "tests/rls", name), "utf8"));
        console.log(`PASS suite ${name}`);
      } catch (error) {
        failed = true;
        console.error(`FAIL suite ${name}: ${error.message}`);
      }
    }
    const runners = readdirSync(join(ROOT, "tests/rls")).filter((name) => /^run_.*\.py$/.test(name)).sort();
    for (const name of runners) {
      try {
        // Helpers receive only the validated scratch target and must not rebuild
        // or migrate it. Their concurrency checks run against the same fresh DB.
        const python = process.platform === "win32" ? "python" : "python3";
        const output = execute(python, [join(ROOT, "tests/rls", name), "--database", database]);
        console.log(output.trim());
        console.log(`PASS suite ${name}`);
      } catch (error) {
        failed = true;
        console.error(`FAIL suite ${name}: ${error.message}`);
      }
    }
  } catch (error) {
    failed = true;
    console.error(`FAIL RLS setup: ${error.message}`);
  } finally {
    try { cleanup(); } catch (error) { failed = true; console.error(`FAIL cleanup: ${error.message}`); }
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main();
}
