from pathlib import Path

root = Path(__file__).resolve().parents[1]
target = root / 'supabase/tests'
friend = Path('C:/SURECUREVISIT/.worktrees/kiro-integ-friend')
(target / '_tap_helpers.inc').write_text((friend / 'supabase/tests/_tap_helpers.inc').read_text())
source = (root / 'tests/rls/b01_booking.sql').read_text()
fixtures = source.split('-- B01 FIXTURES START:', 1)[1].split('\n', 1)[1].split('-- B01 FIXTURES END', 1)[0]
(target / '_b01_fixture.inc').write_text('-- Synthetic rollback-only B01 fixtures.\n' + fixtures)
start = source.index('create function pg_temp.assert_true')
end = source.index("select pg_temp.assert_true(to_regclass")
source = source[:start] + '\\ir _tap_helpers.inc\n' + source[end:]
source = source.replace('rollback;', '\\echo 1..1\n\\echo ok 1 - b01_legacy\nrollback;')
(target / '012_b01_legacy.test.sql').write_text(source)

category_suite = ['\\set ON_ERROR_STOP on\nbegin;\n\\ir _tap_helpers.inc\n\\ir _b01_fixture.inc\n']
for category in ['lab', 'caretaker', 'ambulance']:
    category_suite.append(f"""
reset role;
insert into public.providers(id,individual_owner_profile_id,category,status,verification_state)
 values(gen_random_uuid(),'b1000000-0000-4000-8000-000000000002','{category}','active','approved') returning id as provider \\gset
insert into public.provider_profiles(provider_id,display_name) values(:'provider','Synthetic {category}');
insert into public.provider_documents(id,provider_id,owner_profile_id,kind,object_name,content_type,status,expires_at)
 select doc_id,:'provider','b1000000-0000-4000-8000-000000000002',providers_private.required_kind('{category}'),:'provider'||'/'||doc_id::text||'.pdf','application/pdf','verified',now()+interval '1 year' from (select gen_random_uuid() as doc_id) d;
insert into storage.objects(bucket_id,name) select bucket_id,object_name from public.provider_documents where provider_id=:'provider';
insert into public.service_catalog_types(id,code,category,name,unit) values(gen_random_uuid(),'b01_{category}','{category}','Synthetic {category}','visit') returning id as catalog_type \\gset
insert into public.services(id,provider_id,category,catalog_type_id,title,duration_minutes,status) values(gen_random_uuid(),:'provider','{category}',:'catalog_type','Synthetic {category}',30,'published') returning id as service \\gset
insert into public.service_price_versions(service_id,catalog_type_id,version,amount_paise,unit,terms_version,effective_from)
 values(:'service',:'catalog_type',1,10000,'visit','synthetic-v1',now()-interval '1 day');
insert into public.provider_service_areas(provider_id,pin_code,proposed_by,status,approved_by,approved_at,valid_from,valid_to)
 values(:'provider','599991','b1000000-0000-4000-8000-000000000002','approved','b1000000-0000-4000-8000-000000000004',now(),now()-interval '1 day',now()+interval '6 months');
set local role authenticated;
select set_config('request.jwt.claims','{{"sub":"b1000000-0000-4000-8000-000000000001"}}',true);
select public.create_booking_request('b2000000-0000-4000-8000-000000000001',:'service','b5000000-0000-4000-8000-000000000001',now()+interval '2 days',gen_random_uuid()) as booking \\gset
select set_config('request.jwt.claims','{{"sub":"b1000000-0000-4000-8000-000000000002"}}',true);
select pg_temp.expect_state(format('select public.accept_booking(%L,2,array[''b6000000-0000-4000-8000-000000000001''::uuid])',:'booking'),'55000','{category} acceptance deferred');
select pg_temp.assert_true(public.get_booking(:'booking')->>'state'='requested','{category} remains requested');
""")
category_suite.append("reset role;\nselect pg_temp.assert_true((select count(*)=0 from public.booking_assignments),'no deferred assignments');\n\\echo 1..1\n\\echo ok 1 - b01_categories\nrollback;\n")
(target / '013_b01_categories.test.sql').write_text(''.join(category_suite))
