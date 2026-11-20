#!/usr/bin/env bash
# CI helper: run a command; if it fails, publish a GitHub error annotation with the
# migration being applied, every ERROR/FATAL/failed line and the output tail. Annotations
# show on the public run page, so the failing migration or pgTAP suite is readable
# without signing in to download the logs.
log=$(mktemp)
"$@" 2>&1 | tee "$log"
code=${PIPESTATUS[0]}
if [ "$code" -ne 0 ]; then
  msg=$( { grep -E 'Applying migration' "$log" | tail -n 2
           grep -iE 'ERROR|FATAL|not ok|failed|SQLSTATE|At statement|Failed test|Result:' "$log" | grep -v '^#' | head -n 40
           echo '--- tail ---'
           grep -v '^[[:space:]]*$' "$log" | tail -n 12; } | cut -c1-300 \
         | sed -e 's/%/%25/g' -e 's/\r//g' | awk 'BEGIN{ORS="%0A"}{print}')
  echo "::error title=${1} ${2:-} failed (exit $code)::$msg"
fi
exit "$code"
