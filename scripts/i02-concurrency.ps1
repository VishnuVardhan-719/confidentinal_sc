# I02 two-session concurrency check against the LOCAL Supabase DB container only.
# Commits synthetic rows; run `npx supabase db reset` afterwards. Usage: pwsh scripts/i02-concurrency.ps1
$ErrorActionPreference = 'Stop'
$c = 'supabase_db_surecure-visit'
function Psql([string]$sql) { $sql | docker exec -i $c psql -U postgres -X -q -t -A -v ON_ERROR_STOP=1 2>&1 }
$owner = '40000000-0000-0000-0000-000000000001'
$admin = '40000000-0000-0000-0000-000000000002'
$login = "select set_config('request.jwt.claims',json_build_object('sub','$owner','role','authenticated','aal','aal1')::text,false); set role authenticated;"
$adminLogin = "select set_config('request.jwt.claims',json_build_object('sub','$admin','role','authenticated','aal','aal2')::text,false); set role authenticated;"

Psql @"
insert into auth.users(id,email) values('$owner','synthetic-i02-race-owner@example.invalid'),('$admin','synthetic-i02-race-admin@example.invalid') on conflict do nothing;
insert into public.admin_capabilities(profile_id,capability,reason_code) values('$admin','provider:suspend','SYNTHETIC_RACE');
"@ | Out-Null

# Race 1: two sessions create the same owner+category provider; the second waits on the profile lock.
$a = Start-Job { param($c,$q) $q | docker exec -i $c psql -U postgres -X -q -t -A 2>&1 } -ArgumentList $c, "$login begin; select public.create_provider('caretaker',null,'SYNTHETIC Race'); select pg_sleep(3); commit;"
Start-Sleep -Milliseconds 800
$b = Start-Job { param($c,$q) $q | docker exec -i $c psql -U postgres -X -q -t -A 2>&1 } -ArgumentList $c, "$login select public.create_provider('caretaker',null,'SYNTHETIC Race 2');"
$ra = (Receive-Job $a -Wait | Where-Object { $_ -match '^[0-9a-f-]{36}$' }) -join ''
$rb = (Receive-Job $b -Wait | Where-Object { $_ -match '^[0-9a-f-]{36}$' }) -join ''
$count = Psql "select count(*) from public.providers where individual_owner_profile_id='$owner' and category='caretaker';"
$ok1 = ($ra -ne '' -and $ra -eq $rb -and "$count".Trim() -eq '1')
"race1 create_provider: sessionA=$ra sessionB=$rb rows=$("$count".Trim()) -> $(if($ok1){'ok'}else{'FAIL'})"

# Race 2: two suspensions of one approved case with the same expected version; exactly one may win.
$p = "$ra"
Psql @"
update public.caretaker_profiles set skills='{companionship}',languages='{en}' where provider_id='$p';
update public.provider_verification_cases set state='approved',verified_until=now()+interval '30 days',decided_by_profile_id='$admin',decided_at=now() where provider_id='$p';
update public.providers set verification_state='approved',published_profile='{"display_name":"SYNTHETIC Race"}',published_at=now(),verified_until=now()+interval '30 days' where id='$p';
"@ | Out-Null
$case = ("$(Psql "select id from public.provider_verification_cases where provider_id='$p';")").Trim()
$ver = ("$(Psql "select version from public.provider_verification_cases where id='$case';")").Trim()
$sa = Start-Job { param($c,$q) $q | docker exec -i $c psql -U postgres -X -q -t -A 2>&1 } -ArgumentList $c, "$adminLogin begin; select public.suspend_provider('$case','SYNTHETIC_RACE',null,$ver,gen_random_uuid()); select pg_sleep(3); commit;"
Start-Sleep -Milliseconds 800
$sb = Start-Job { param($c,$q) $q | docker exec -i $c psql -U postgres -X -q -t -A 2>&1 } -ArgumentList $c, "$adminLogin select public.suspend_provider('$case','SYNTHETIC_RACE',null,$ver,gen_random_uuid());"
$oa = (Receive-Job $sa -Wait) -join ' '
$ob = (Receive-Job $sb -Wait) -join ' '
$events = ("$(Psql "select count(*) from public.provider_verification_events where case_id='$case' and event_type='suspended';")").Trim()
$ok2 = ($oa -notmatch 'ERROR' -and $ob -match 'version conflict' -and $events -eq '1')
"race2 suspend: sessionA=$(if($oa -match 'ERROR'){'error'}else{'committed'}) sessionB=$(if($ob -match 'version conflict'){'40001 version conflict'}else{$ob}) suspended_events=$events -> $(if($ok2){'ok'}else{'FAIL'})"
if (-not ($ok1 -and $ok2)) { exit 1 }
