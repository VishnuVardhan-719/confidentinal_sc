\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _b01_fixture.inc
\ir _p5s_fixture.inc
-- P5 shared engine §9 (P5-08): reasons are rows; (category, reason) pairs are checked on
-- every event; blocks_cancel carries the cancellation rule.

select pg_temp.assert_true((select count(*)=12 from booking_private.reason_codes where code in ('requested','accepted','confirmed','patient_request',
 'provider_unavailable','unable_to_service','other','en_route','arrived','service_started','service_completed','reassigned')),'the 12 built codes exist');
select pg_temp.assert_true((select count(*)=19 from booking_private.reason_codes),'shared block seeds 19 codes');
select pg_temp.assert_true(not exists(select 1 from booking_private.category_reasons where code='reassigned'),'reassigned has no category pair');
select pg_temp.assert_true((select array_agg(category||':'||n order by category) from (select category,count(*) n from booking_private.category_reasons group by category) x)
 =array['ambulance:16','caretaker:13','doctor:18','lab:13'],'shared pairs per category (§9.4)');
select pg_temp.assert_true((select array_agg(category||':'||code order by category,code) from booking_private.category_reasons where blocks_cancel)
 =array['ambulance:absence_reported','ambulance:arrived','ambulance:en_route','caretaker:service_started','doctor:absence_reported','doctor:arrived','doctor:en_route','doctor:service_started','lab:absence_reported'],'blocks_cancel rows');
select pg_temp.assert_true(not exists(select 1 from pg_constraint where conrelid='public.booking_events'::regclass and contype='c' and pg_get_constraintdef(oid) like '%reason%'),'inline reason CHECK removed');
select pg_temp.assert_true(exists(select 1 from pg_constraint where conname='booking_events_reason_fk' and confrelid='booking_private.reason_codes'::regclass),'reason foreign key');

-- Registries are append-only, for the owner too.
select pg_temp.expect_state('update booking_private.reason_codes set code=''renamed'' where code=''other''','55000','reason code update refused');
select pg_temp.expect_state('delete from booking_private.reason_codes where code=''reassigned''','55000','reason code delete refused');
select pg_temp.expect_state('truncate booking_private.reason_codes cascade','55000','reason code truncate refused');
select pg_temp.expect_state('update booking_private.category_reasons set blocks_cancel=true where code=''other''','55000','pair update refused');
select pg_temp.expect_state('delete from booking_private.category_reasons where code=''other''','55000','pair delete refused');
select pg_temp.expect_state('truncate booking_private.category_reasons','55000','pair truncate refused');
select pg_temp.expect_state('delete from booking_private.category_paths','55000','path delete refused');
select pg_temp.expect_state('update booking_private.exception_kinds set blocks_resources=false','55000','exception kind update refused');
select pg_temp.expect_state('insert into booking_private.reason_codes values (''Bad Code'')','23514','code shape enforced');
-- Category blocks add codes and pairs with on conflict do nothing.
insert into booking_private.reason_codes values ('other') on conflict do nothing;
insert into booking_private.category_reasons values ('lab','other',false) on conflict do nothing;

-- Pair trigger: unknown code and a known code for the wrong category are invalid_reason;
-- with the trigger off, the foreign key still rejects an unknown code.
select pg_temp.p5_book('lab',pg_temp.p5_at(2),array['c6000000-0000-4000-8000-000000000001'::uuid]) as lab \gset
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select booking_private.transition(%L,''confirmed'',''en_route'')',:'lab'),'22023','doctor/ambulance code on a lab booking');
select pg_temp.expect_state(format('select booking_private.transition(%L,''confirmed'',''service_started'')',:'lab'),'22023','care code on a lab booking');
select pg_temp.expect_state(format('select booking_private.transition(%L,''confirmed'',''no_such_code'')',:'lab'),'22023','unknown code');
select pg_temp.expect_state(format('select booking_private.transition(%L,''confirmed'',''reassigned'')',:'lab'),'22023','unpaired code');
alter table public.booking_events disable trigger p5s_event_reason;
select pg_temp.expect_state(format('insert into public.booking_events(booking_id,actor_profile_id,from_state,to_state,aggregate_version,reason) values (%L,''c1000000-0000-4000-8000-000000000001'',''confirmed'',''confirmed'',99,''no_such_code'')',:'lab'),'23503','foreign key rejects an unknown code');
alter table public.booking_events enable trigger p5s_event_reason;
select pg_temp.p5_raw('caretaker','confirmed',now()+interval '1 day') as care \gset
select pg_temp.expect_state(format('select booking_private.transition(%L,''confirmed'',''no_show_confirmed'')',:'care'),'22023','no_show_confirmed not paired for caretaker');
select pg_temp.assert_true((select count(*)=0 from public.booking_events where booking_id=:'lab' and reason not in ('requested','accepted','confirmed')),'rejected reasons wrote nothing');

-- blocks_cancel: an en_route event blocks cancellation for doctor and ambulance.
select pg_temp.p5_book('doctor',pg_temp.p5_at(2,1),array['c6000000-0000-4000-8000-000000000002'::uuid]) as doc \gset
select pg_temp.p5_book('ambulance',pg_temp.p5_at(2,2),array['c6000000-0000-4000-8000-000000000002'::uuid,'c6000000-0000-4000-8000-000000000003'::uuid]) as amb \gset
select pg_temp.p5_book('ambulance',pg_temp.p5_at(2,3),array['c6000000-0000-4000-8000-000000000001'::uuid,'c6000000-0000-4000-8000-000000000004'::uuid]) as amb_ok \gset
select pg_temp.p5_step(:'doc','c1000000-0000-4000-8000-000000000003','confirmed','en_route');
select pg_temp.p5_step(:'amb','c1000000-0000-4000-8000-000000000003','confirmed','en_route');
-- eligibility_blocked is an ambulance-block code; inserted here as that block would.
insert into booking_private.reason_codes values ('eligibility_blocked') on conflict do nothing;
insert into booking_private.category_reasons values ('ambulance','eligibility_blocked',false) on conflict do nothing;
select pg_temp.p5_step(:'amb_ok','c1000000-0000-4000-8000-000000000002','confirmed','eligibility_blocked');
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.cancel_booking(%L,5,''provider_unavailable'')',:'doc'),'55000','doctor cancel blocked after en_route');
select pg_temp.expect_state(format('select public.cancel_booking(%L,5,''provider_unavailable'')',:'amb'),'55000','ambulance cancel blocked after en_route');
select pg_temp.assert_true(public.cancel_booking(:'amb_ok',5,'provider_unavailable')=6,'ambulance cancel allowed after eligibility_blocked');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select pg_temp.expect_state(format('select public.cancel_booking(%L,5,''patient_request'')',:'doc'),'55000','patient cancel blocked too');
reset role;
select pg_temp.assert_true((select count(*)=1 from public.audit_events where target_id=:'doc' and action='booking.en_route'),'audit action stays booking.<reason>');
\echo 1..1
\echo ok 1 - 025_p5s_reasons
rollback;
