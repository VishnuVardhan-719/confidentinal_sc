\set ON_ERROR_STOP on
begin;
\ir _tap_helpers.inc
\ir _n01_fixture.inc
-- Authored, DB NOT EXECUTED. Offline ids vs actual JWT predicates for every profile.
do $$ declare p public.providers; x public.profiles; e uuid; b uuid; offline boolean; live boolean; begin
 for p in select * from public.providers loop
  for x in select * from public.profiles loop
   perform pg_temp.as_user(x.id);
   offline:=exists(select 1 from notify_private.schedulers_of(p.id) r where r=x.id);
   live:=coalesce(booking_private.scheduler(p.id),false);
   perform pg_temp.assert_true(offline=live,'scheduler parity '||p.id||' '||x.id);
   offline:=exists(select 1 from notify_private.managers_of(p.id) r where r=x.id);
   live:=coalesce(providers_private.access(p.id,'manage'),false);
   perform pg_temp.assert_true(offline=live,'manager parity '||p.id||' '||x.id);
   offline:=exists(select 1 from notify_private.capabilities_of(p.id,'provider:verify') r where r=x.id);
   live:=coalesce(providers_private.verifier(p.organization_id),false);
   perform pg_temp.assert_true(offline=live,'provider verifier capability parity '||p.id||' '||x.id);
   offline:=exists(select 1 from notify_private.capabilities_of(p.id,'coverage:verify') r where r=x.id);
   live:=coalesce(catalog_private.verifier(p.organization_id),false);
   perform pg_temp.assert_true(offline=live,'coverage verifier capability parity '||p.id||' '||x.id);
  end loop;
 end loop;
 e:=pg_temp.n01_event('doctor','confirmed','accepted','confirmed');
 select booking_id into b from notify_private.events where id=e;
 for x in select * from public.profiles loop
  perform pg_temp.as_user(x.id);
  offline:=exists(select 1 from notify_private.assignees_of(b,clock_timestamp()) r where r=x.id);
  live:=coalesce(identity_private.is_assigned(b,booking_private.person_purpose('doctor')),false);
  perform pg_temp.assert_true(offline=live,'active assignment parity '||x.id);
 end loop;
 update public.organization_members set status='disabled' where profile_id='c1000000-0000-4000-8000-000000000009';
 perform pg_temp.assert_true(not exists(select 1 from notify_private.schedulers_of(pg_temp.p5_provider('lab')) r where r='c1000000-0000-4000-8000-000000000009'),'revoked membership dropped');
 update public.profiles set status='disabled' where id='c1000000-0000-4000-8000-000000000001';
 perform pg_temp.assert_true(not exists(select 1 from notify_private.schedulers_of(pg_temp.p5_provider('lab')) r where r='c1000000-0000-4000-8000-000000000001'),'disabled account dropped');
 update public.admin_capabilities set expires_at=clock_timestamp()-interval '1 second',valid_from=clock_timestamp()-interval '1 day' where profile_id='c1000000-0000-4000-8000-000000000004';
 perform pg_temp.assert_true(not exists(select 1 from notify_private.capabilities_of(pg_temp.p5_provider('lab'),'provider:verify') r where r='c1000000-0000-4000-8000-000000000004'),'expired capability dropped');
end $$;
-- M01 bootstrap leaves owner acceptance null. I02 manager/P01 finance reads
-- permit that owner, while B01 scheduler deliberately requires acceptance.
update public.organization_members set accepted_at=null where profile_id='c1000000-0000-4000-8000-000000000007';
update public.organization_members set scopes=scopes||array['finance:read'] where profile_id='c1000000-0000-4000-8000-000000000007';
-- Provider B is not seeded by P5, so reuse A's owner after restoring its status.
update public.profiles set status='active' where id='c1000000-0000-4000-8000-000000000001';
update public.organization_members set accepted_at=null where profile_id='c1000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(exists(select 1 from notify_private.managers_of(pg_temp.p5_provider('lab')) r where r='c1000000-0000-4000-8000-000000000001'),'bootstrap owner manager retained');
select pg_temp.assert_true(exists(select 1 from notify_private.members_of(pg_temp.p5_provider('lab'),'finance:read') r where r='c1000000-0000-4000-8000-000000000001'),'bootstrap owner finance reader retained');
select pg_temp.assert_true(not exists(select 1 from notify_private.schedulers_of(pg_temp.p5_provider('lab')) r where r='c1000000-0000-4000-8000-000000000001'),'scheduler acceptance parity retained');
set constraints all immediate;
\echo 1..1
\echo ok 1 - 104_n01_audience_parity
rollback;
