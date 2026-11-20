"""One-command database verification for the local Supabase stack (needs Docker).

Runs, in order, and keeps going after a failure so one run shows every problem:
  1. npx supabase db reset --local   (applies every migration; no seed is loaded)
  2. npx supabase test db             (every supabase/tests/*.test.sql suite)
  3. each tests/rls/run_*.py runner   (concurrency/race cases in scratch databases)

Each step's full output goes to .verify/<step>.log; a summary is printed at the end and
written to .verify/SUMMARY.txt. Exit code is 0 only when every step passed.

Usage:  python scripts/db_verify.py            (all steps)
        python scripts/db_verify.py --skip-reset
        python scripts/db_verify.py --only p5c  (runners whose name contains "p5c")
"""
import argparse
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".verify"
# Dependency order: identity, booking core, shared engine, categories, payments, notifications.
ORDER = ["i01_followups", "b01", "p5s", "p5d", "p5l", "p5a", "p5c", "p01", "n01", "dc_core", "dc_extras"]


def runners(only):
    found = {p.stem.removeprefix("run_").removesuffix("_concurrency"): p for p in (ROOT / "tests/rls").glob("run_*.py")}
    names = [n for n in ORDER if n in found] + sorted(n for n in found if n not in ORDER)
    return [(n, found[n]) for n in names if not only or only in n]


def step(name, cmd, timeout):
    log = OUT / f"{name}.log"
    start = time.time()
    try:
        proc = subprocess.run(cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                              text=True, encoding="utf-8", errors="replace", timeout=timeout)
        code, text = proc.returncode, proc.stdout
    except subprocess.TimeoutExpired as e:
        out = e.stdout or ""
        code, text = "timeout", out if isinstance(out, str) else out.decode("utf-8", "replace")
    log.write_text(text, encoding="utf-8")
    ok = code == 0
    tail = "" if ok else " | " + " / ".join(l.strip() for l in text.strip().splitlines()[-3:])[:300]
    line = f"{'PASS' if ok else 'FAIL'}  {name:<16} {time.time() - start:6.0f}s  exit={code}  log={log.relative_to(ROOT)}{tail}"
    print(line, flush=True)
    return ok, line


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-reset", action="store_true")
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if not npx or not (shutil.which("docker") or shutil.which("docker.exe")):
        sys.exit("needs npx and docker on PATH, and `npx supabase start` already running")
    OUT.mkdir(exist_ok=True)
    results = []
    if not args.only:
        if not args.skip_reset:
            results.append(step("db_reset", [npx, "supabase", "db", "reset", "--local"], 1800))
        results.append(step("test_db", [npx, "supabase", "test", "db"], 3600))
    for name, path in runners(args.only):
        results.append(step(f"runner_{name}", [sys.executable, str(path)], 3600))
    passed = sum(ok for ok, _ in results)
    summary = "\n".join(line for _, line in results) + f"\n\n{passed}/{len(results)} steps passed\n"
    (OUT / "SUMMARY.txt").write_text(summary, encoding="utf-8")
    print(f"\n{passed}/{len(results)} steps passed. Summary: .verify/SUMMARY.txt")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
