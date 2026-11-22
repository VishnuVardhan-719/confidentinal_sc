#!/bin/bash
# Patient specs now sign in through fixture-session (real fe-b login); reruns of lab-directory + admin-verification.
cd /c/Users/Yashwanth/fe2-int
FAILED=0
CFG=tests/e2e/fixture-all.config.ts
run() { E2E_PORT=3320 powershell.exe -NoProfile -Command "$1" 2>&1 | grep --line-buffered -E "^== |^   FAIL|SERVER FAILED"; [ "${PIPESTATUS[0]}" -eq 0 ] || FAILED=1; }
ON="@{E2E_FEP_MODE='session';E2E_FEP_CLINICAL='on';FIXTURE_PATIENT_SESSION='self';FIXTURE_BOOKING_SCENARIO='requested';FIXTURE_ADMIN_SESSION='moderator'}"
OFF="@{E2E_FEP_MODE='session';E2E_FEP_CLINICAL='off';FIXTURE_PATIENT_SESSION='self';FIXTURE_BOOKING_SCENARIO='requested';FIXTURE_NOTIFICATION_SCENARIO='empty';FIXTURE_FAMILY_SCENARIO='empty';FIXTURE_SAVED_SCENARIO='empty';FIXTURE_REVIEWS_SCENARIO='empty'}"
for p in desktop-1280 mobile-390; do
  run ".\.context\int3-run.ps1 -Spec lab-directory -Projects $p -Config $CFG"
  run ".\.context\int3-run.ps1 -Spec admin-verification -Projects $p -Config $CFG"
done
for s in a11y-sweep-p patient-family patient-reminders patient-reviews patient-review-changes patient-saved; do
  for p in desktop-1280 mobile-390; do
    run ".\.context\int3-run.ps1 -Spec $s -Projects $p -Config $CFG -Env $ON"
  done
done
for s in patient-family patient-reminders patient-reviews patient-saved patient-review-changes a11y-sweep-p; do
  for p in desktop-1280 mobile-390; do
    run ".\.context\int3-run.ps1 -Spec $s -Projects $p -Config $CFG -ClinicalOff -Env $OFF"
  done
done
echo "exit=$FAILED"
exit $FAILED
