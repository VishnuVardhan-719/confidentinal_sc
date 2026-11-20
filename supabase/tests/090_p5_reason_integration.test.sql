\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
-- P5 integration (contract §9.5): after every category block merges, the reason registries
-- hold exactly the §9.4 mapping. Extension recorded here: the doctor block adds
-- arrival_verified and arrival_assisted (arrival code, DC02), both blocks_cancel, because
-- they follow `arrived`. Any other extra or missing pair, code or cancel flag fails.

create temp table expected_pairs(category text,code text,blocks_cancel boolean) on commit drop;
insert into expected_pairs
 select c,x,false from unnest(array['doctor','lab','ambulance','caretaker']) c,
  unnest(array['requested','accepted','confirmed','patient_request','provider_unavailable','unable_to_service','other',
   'ops_closeout','provider_did_not_attend','unsafe_conditions']) x;
insert into expected_pairs
 select c,x,false from unnest(array['doctor','lab','ambulance']) c,unnest(array['no_show_confirmed','absence_disputed']) x;
insert into expected_pairs values
 ('doctor','en_route',true),('ambulance','en_route',true),('doctor','arrived',true),('ambulance','arrived',true),
 ('doctor','service_started',true),('caretaker','service_started',true),
 ('doctor','service_completed',false),('caretaker','service_completed',false),
 ('doctor','absence_reported',true),('lab','absence_reported',true),('ambulance','absence_reported',true),
 ('doctor','ended_for_emergency',false),('ambulance','ended_for_emergency',false),('caretaker','ended_for_emergency',false),
 ('doctor','address_not_found',false),('doctor','declined_at_door',false),('doctor','doctor_unable',false),('doctor','patient_requested_stop',false),
 ('doctor','arrival_verified',true),('doctor','arrival_assisted',true),
 ('lab','collection_started',true),('lab','sample_collected',false),('lab','sample_handed_over',false),('lab','collection_failed',false),('lab','handoff_failed',false),
 ('ambulance','picked_up',true),('ambulance','destination_reached',false),('ambulance','eligibility_blocked',false),
 ('ambulance','vehicle_breakdown',false),('ambulance','requirement_mismatch',false),('ambulance','driver_unable',false);

select pg_temp.assert_true((select count(*)=77 from expected_pairs),'expected table has 77 pairs');
select pg_temp.assert_true(not exists(select category,code from expected_pairs except select category,code from booking_private.category_reasons),
 'no §9.4 pair missing: '||coalesce((select string_agg(category||':'||code,', ') from (select category,code from expected_pairs except select category,code from booking_private.category_reasons) m),''));
select pg_temp.assert_true(not exists(select category,code from booking_private.category_reasons except select category,code from expected_pairs),
 'no pair outside §9.4: '||coalesce((select string_agg(category||':'||code,', ') from (select category,code from booking_private.category_reasons except select category,code from expected_pairs) m),''));
select pg_temp.assert_true(not exists(select category,code,blocks_cancel from expected_pairs except select category,code,blocks_cancel from booking_private.category_reasons),
 'blocks_cancel matches §9.4: '||coalesce((select string_agg(category||':'||code,', ') from (select category,code,blocks_cancel from expected_pairs except select category,code,blocks_cancel from booking_private.category_reasons) m),''));
select pg_temp.assert_true((select count(*)=77 from booking_private.category_reasons),'category_reasons has exactly 77 rows');

-- Codes: every paired code plus `reassigned` (a code with no pair until reassignment exists).
select pg_temp.assert_true((select array_agg(code order by code) from booking_private.reason_codes)
 =(select array_agg(code order by code) from (select distinct code from expected_pairs union select 'reassigned') x),
 'reason_codes is the paired codes plus reassigned');
select pg_temp.assert_true((select count(*)=36 from booking_private.reason_codes),'36 reason codes');
select pg_temp.assert_true(not exists(select 1 from booking_private.category_reasons where code='reassigned'),'reassigned has no pair');

-- Every reason written by a booking event is a registered pair for its booking's category.
select pg_temp.assert_true(not exists(select 1 from public.booking_events e join public.bookings b on b.id=e.booking_id
 where not exists(select 1 from booking_private.category_reasons r where r.category=b.category and r.code=e.reason)),'no stored event outside its category pairs');

\echo 1..1
\echo ok 1 - 090_p5_reason_integration
rollback;
