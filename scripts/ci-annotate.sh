#!/usr/bin/env bash
# CI helper: run a command; if it fails, print its last 40 non-empty output lines as one
# GitHub error annotation. Annotations show on the public run page, so the failing
# migration or pgTAP suite is readable without signing in to download the logs.
log=$(mktemp)
"$@" 2>&1 | tee "$log"
code=${PIPESTATUS[0]}
if [ "$code" -ne 0 ]; then
  msg=$(grep -v '^[[:space:]]*$' "$log" | tail -n 40 | sed -e 's/%/%25/g' -e 's/\r//g' | awk 'BEGIN{ORS="%0A"}{print}')
  echo "::error title=${1} ${2:-} failed (exit $code)::$msg"
fi
exit "$code"
