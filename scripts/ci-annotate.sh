#!/usr/bin/env bash
# CI helper: run a command; if it fails, publish a GitHub error annotation with the
# migration being applied, every ERROR/FATAL/failed line and the output tail. Annotations
# show on the public run page, so the failing migration or pgTAP suite is readable
# without signing in to download the logs. The full list of failing lines also goes to
# the job summary (annotations are truncated; the summary is not).
log=$(mktemp)
"$@" 2>&1 | tee "$log"
code=${PIPESTATUS[0]}
if [ "$code" -ne 0 ]; then
  # Each error keeps the CONTEXT lines psql prints after it (which function, which line).
  msg=$( { grep -E 'Applying migration' "$log" | tail -n 2
           grep -iE -A4 'ERROR|FATAL|not ok|SQLSTATE|At statement|Failed test|Result:' "$log" \
             | grep -vE '^(#|ok [0-9]|--$)|Wstat:|Parse errors:|^/home/' | sed -e 's#^psql:[^ ]*/supabase/tests/##' | head -n 200
           echo '--- tail ---'
           grep -v '^[[:space:]]*$' "$log" | tail -n 12; } | cut -c1-300 \
         | sed -e 's/%/%25/g' -e 's/\r//g' | awk 'BEGIN{ORS="%0A"}{print}')
  echo "::error title=${1} ${2:-} failed (exit $code)::$msg"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    { echo "### ${1} ${2:-} failed (exit $code)"
      echo '```'
      grep -E 'Applying migration' "$log" | tail -n 2
      # Each error with the CONTEXT/DETAIL lines psql prints after it (function and line).
      grep -iE -A6 'ERROR|FATAL|not ok|SQLSTATE|At statement|Failed test|Result:' "$log" \
        | grep -vE '^(#|ok [0-9])' | sed -e 's#^psql:[^ ]*/supabase/tests/##' | cut -c1-400 | head -n 600
      echo '```'; } >> "$GITHUB_STEP_SUMMARY"
  fi
fi
exit "$code"
