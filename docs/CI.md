# CI

Workflow: `.github/workflows/ci.yml`.

## When it runs

- Every `pull_request`.
- `push` to `main`, `develop`, `integ/**`, `feat/**` and `fix/**`. Other branches (for example `chore/**`, `task/**`, `docs/**`) are checked only through their pull request.
- A newer run on the same ref cancels the older one (`concurrency`, `cancel-in-progress: true`).
- The workflow token has `contents: read` only. Checkout does not persist credentials. No repository secrets are used.

## Jobs

### `app`

Node 22 (package.json has no `engines` field and there is no `.nvmrc`; vitest 5.1 needs `^22.12.0`). npm cache via `actions/setup-node`.

| Step | Command |
|---|---|
| install | `npm ci --no-audit --no-fund` |
| eslint | `npm run lint` |
| typecheck | `npm run typecheck` (`next typegen && tsc --noEmit`) |
| unit | `npm test` (`vitest run`, `tests/unit/**/*.test.ts`) |
| build | `npm run build` (`next build`) |

`src/lib/env` requires `NEXT_PUBLIC_SUPABASE_URL` (a URL) and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (non-empty). CI sets non-secret placeholders: `http://127.0.0.1:58421` and `ci-placeholder-anon-key`. `SUPABASE_SERVICE_ROLE_KEY` is optional and stays unset. All `FEATURE_*` flags stay unset, so they are off.

The opt-in Storage HTTP test (`I02_STORAGE_HTTP=1`) is skipped in CI because it needs a running local stack.

### `db`

Supabase CLI 3.2.0 installed by `supabase/setup-cli@v3`.

1. `supabase start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,realtime,postgres-meta,supavisor`. Postgres, Auth, Storage, PostgREST and Kong still start, because the SQL suites use the `auth` and `storage` schemas.
2. `supabase db reset`: replays every file in `supabase/migrations` on a fresh database. `supabase/seed.sql` does not exist, so nothing is seeded (the opt-in demo seed `supabase/seeds/local_demo.sql` is never loaded in CI).
3. `supabase test db`: runs `pg_prove` on `supabase/tests/*.test.sql`. The `.inc` helpers are pulled in by `\ir` and are not run on their own.

On failure, `supabase status`, `docker ps -a` and `docker logs` of every `supabase_*` container are uploaded as the `supabase-logs` artifact (kept 7 days).

`tests/rls/*.py` (concurrency and follow-up runners) are not part of CI.

## Reproduce locally

App checks, from the repo root (Node 22.12+):

```bash
npm ci
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:58421 NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder-anon-key \
  sh -c 'npm run lint && npm run typecheck && npm test && npm run build'
```

PowerShell:

```powershell
npm ci
$env:NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:58421"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = "ci-placeholder-anon-key"
npm run lint; npm run typecheck; npm test; npm run build
```

Database checks need Docker and the Supabase CLI 3.2.0. `supabase db reset` wipes the local database, so run it only on a disposable local stack with synthetic data:

```bash
npx supabase@3.2.0 start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,realtime,postgres-meta,supavisor
npx supabase@3.2.0 db reset
npx supabase@3.2.0 test db
```

## Changing versions

Action majors (`checkout@v7`, `setup-node@v7`, `upload-artifact@v7`, `supabase/setup-cli@v3`) and the CLI version are pinned in the workflow. Bump them in a dedicated PR. If `engines.node` or `.nvmrc` is added, switch `setup-node` to `node-version-file`.
