-- DC extras 2/5 / Kiro / feat/DC-extras / base integ/all bed2877.
-- Design §3 (DC03 progress delta read) and §4 (DC10 visit-facing payment status).
-- Synthetic local/staging only. Authored, DB NOT EXECUTED.
--
-- DC03: no table joins supabase_realtime (doctor design §8.5). The client polls this delta
-- read (src/lib/doctor-extras/progress-poll.ts) and sends its last seen version after a
-- reconnect. Key allowlist: booking_id, state, substate, version, terminal, events[version,
-- reason, occurred_at]. No actor, address, contact, amount or clinical field.
-- DC10: P01a keeps payments in their own ledger; nothing in the booking engine reads
-- public.payments, so visit completion never waits on payment. This read only places the two
-- states side by side for the patient and the visit's doctor. It returns no amount, collector,
-- reference or finance field, and the visit block is returned even when pay-after is off.
begin;

do $$ declare obj text; begin
 foreach obj in array array['dcx_private.require_feature(text,text)','dcx_private.visit_patient(uuid,text)','dcx_private.visit_doctor(uuid)'] loop
  if to_regprocedure(obj) is null then raise exception 'DC extras 002410 preflight: missing %',obj; end if;
 end loop;
 foreach obj in array array['public.payments','payments_private.settings','payments_private.collection_intakes','public.booking_events'] loop
  if to_regclass(obj) is null then raise exception 'DC extras 002410 preflight: missing % (P01a 20261117002000)',obj; end if;
 end loop;
end $$;

create function public.get_visit_progress(p_booking_id uuid,p_after_version integer default 0) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); b public.bookings; sub text; begin
 if p_booking_id is null or p_after_version is null or p_after_version not between 0 and 2147483646 then
  raise exception using errcode='22023',message='invalid_input'; end if;
 perform dcx_private.require_feature('doctor_progress','read');
 select * into b from public.bookings where id=p_booking_id;
 if not found or b.category<>'doctor' or not (dcx_private.visit_patient(b.id,'booking:read') or dcx_private.visit_doctor(b.id)) then
  raise exception using errcode='P0002',message='not_found'; end if;
 select v.substate into sub from public.doctor_visits v where v.booking_id=b.id;
 return jsonb_build_object('booking_id',b.id,'state',b.state,'substate',sub,'version',b.version,
  'terminal',b.state in ('completed','interrupted','cancelled','declined','expired','no_show'),
  'events',coalesce((select jsonb_agg(jsonb_build_object('version',e.aggregate_version,'reason',e.reason,'occurred_at',e.occurred_at)
    order by e.aggregate_version)
   from (select x.aggregate_version,x.reason,x.occurred_at from public.booking_events x
    where x.booking_id=b.id and x.aggregate_version>p_after_version order by x.aggregate_version limit 50) e),'[]'::jsonb));
end $$;

create function public.get_visit_payment_status(p_booking_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=identity_private.require_actor(); b public.bookings; sub text; pay public.payments; enabled boolean; payment jsonb; begin
 if p_booking_id is null then raise exception using errcode='22023',message='invalid_input'; end if;
 perform dcx_private.require_feature('doctor_visit_payment','read');
 select * into b from public.bookings where id=p_booking_id;
 if not found or b.category<>'doctor' or not (dcx_private.visit_patient(b.id,'booking:read') or dcx_private.visit_doctor(b.id)) then
  raise exception using errcode='P0002',message='not_found'; end if;
 select v.substate into sub from public.doctor_visits v where v.booking_id=b.id;
 enabled:=coalesce((select s.pay_after_enabled from payments_private.settings s),false);
 select * into pay from public.payments where booking_id=b.id;
 if enabled and pay.id is not null then
  -- Pay-after is a direct collection reported by the doctor and confirmed by finance. It is
  -- never a gateway capture, so gateway_paid is true only for a non-direct path (P01b).
  payment:=jsonb_build_object('state',pay.state,'version',pay.version,'collection_path',pay.collection_path,
   'gateway_paid',pay.collection_path<>'direct_pay_after' and pay.state='paid',
   'settled_directly',pay.collection_path='direct_pay_after' and pay.state='paid',
   'no_charge',pay.amount_paise=0,
   'review_pending',exists(select 1 from payments_private.collection_intakes i where i.payment_id=pay.id and i.status='pending'));
 end if;
 return jsonb_build_object('booking_id',b.id,
  'visit',jsonb_build_object('state',b.state,'substate',sub,'version',b.version,'completed',b.state='completed'),
  'payment_available',payment is not null,'payment',coalesce(payment,'null'::jsonb));
end $$;

do $$ declare f text; begin
 foreach f in array array['public.get_visit_progress(uuid,integer)','public.get_visit_payment_status(uuid)'] loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
  execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
notify pgrst, 'reload schema';
commit;
