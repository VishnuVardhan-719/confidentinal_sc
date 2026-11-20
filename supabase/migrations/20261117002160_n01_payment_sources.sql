-- N01 payment intake. In-app only; never says money was received by SureCure Visit.
-- Authored, DB NOT EXECUTED.
begin;
do $$ begin
 if to_regclass('public.payment_events') is null or to_regclass('public.payments') is null
 or to_regclass('public.payment_collections') is null or to_regclass('notify_private.events') is null
 or to_regclass('notify_private.rules') is null then
  raise exception 'N01 payment sources require P01a 20261117002000 and N01 core'; end if;
end $$;
create function notify_private.intake_payment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into notify_private.events(source_kind,source_id,booking_id,occurred_at)
 select 'payment_event',new.id,p.booking_id,new.occurred_at from public.payments p where p.id=new.payment_id
 on conflict(source_kind,source_id) do nothing; return null;
end $$;
create trigger n01_intake_payment after insert on public.payment_events for each row execute function notify_private.intake_payment();
insert into notify_private.rules(id,source_kind,match_code,audience,priority,topic,inapp_key,ttl) values
 ('Y01','payment_event','collection.reported','patient','transactional','payment','payment.collection_recorded','h24'),
 ('Y02','payment_event','collection.confirmed','patient','routine','payment','payment.collection_confirmed','h24'),
 ('Y03','payment_event','collection.disputed','collector','transactional','payment','payment.collection_disputed','h24'),
 ('Y04-F','payment_event','payment.disputed','finance','transactional','payment','payment.disputed','h24'),
 ('Y04-M','payment_event','payment.disputed','provider_finance_readers','transactional','payment','payment.disputed','h24'),
 ('Y05-P','payment_event','payment.resolved','patient','transactional','payment','payment.resolved','h24'),
 ('Y05-C','payment_event','payment.resolved','collector','transactional','payment','payment.resolved','h24'),
 ('Y06','payment_event','exception.raised','finance','transactional','payment','payment.exception','h24'),
 ('Y07','payment_event','obligation.voided','patient','routine','payment','payment.nothing_due','h24');
revoke all on function notify_private.intake_payment() from public,anon,authenticated,service_role;
commit;
