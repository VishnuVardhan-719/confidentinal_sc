-- I02 hardening item 4 + CodeRabbit finding 3 / Kiro / integ/friend-backend.
-- Ports O-I02:44-48, 55, 376-384: a public provider reference SCV-DOC|LAB|AMB|CARE-NNNNNN
-- allocated from a row-locked counter. Numbers are never reused for committed rows.
-- Finding 3 fix: lpad(n,6) truncated above 999999 and collided. Six digits is now a
-- minimum width only; larger numbers keep every digit, and bigint overflow raises 22003.
-- Search switches to this reference in 20261117000640 (after the public snapshot exists).
begin;

create table providers_private.reference_counters (
  prefix text primary key check (prefix in ('DOC','LAB','AMB','CARE')),
  last_value bigint not null default 0 check (last_value >= 0)
);
insert into providers_private.reference_counters(prefix) values ('DOC'),('LAB'),('AMB'),('CARE');
alter table providers_private.reference_counters enable row level security;
revoke all on providers_private.reference_counters from public, anon, authenticated;

create function providers_private.format_reference(p_prefix text, p_n bigint) returns text
language sql immutable set search_path = '' as $$
  select 'SCV-' || p_prefix || '-' ||
    case when p_n < 1000000 then lpad(p_n::text, 6, '0') else p_n::text end;
$$;

create function providers_private.next_reference(p_category text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_prefix text; v_n bigint;
begin
  v_prefix := case p_category when 'doctor' then 'DOC' when 'lab' then 'LAB'
    when 'ambulance' then 'AMB' when 'caretaker' then 'CARE' end;
  if v_prefix is null then raise exception using errcode = '22023', message = 'invalid_category'; end if;
  -- The row lock serializes concurrent allocations per prefix.
  update providers_private.reference_counters set last_value = last_value + 1
    where prefix = v_prefix returning last_value into v_n;
  if not found then raise exception using errcode = '55000', message = 'reference_counter_missing'; end if;
  return providers_private.format_reference(v_prefix, v_n);
end;
$$;

alter table public.providers add column public_reference text;
do $$ declare r record; begin
  for r in select id, category from public.providers order by created_at, id loop
    update public.providers set public_reference = providers_private.next_reference(r.category) where id = r.id;
  end loop;
end $$;
alter table public.providers alter column public_reference set not null;
alter table public.providers add constraint providers_public_reference_key unique (public_reference);
alter table public.providers add constraint providers_public_reference_format
  check (public_reference ~ '^SCV-(DOC|LAB|AMB|CARE)-[0-9]{6,19}$');

-- Every insert path (commands, trusted SQL, tests) gets a server-allocated reference;
-- a caller-supplied value is ignored. The reference never changes afterwards.
create function providers_private.guard_reference() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    new.public_reference := providers_private.next_reference(new.category);
  elsif new.public_reference is distinct from old.public_reference then
    raise exception using errcode = '55000', message = 'immutable_reference';
  end if;
  return new;
end;
$$;
create trigger i02h_provider_reference before insert or update on public.providers
  for each row execute function providers_private.guard_reference();

revoke all on function providers_private.format_reference(text, bigint), providers_private.next_reference(text),
  providers_private.guard_reference() from public, anon, authenticated;

commit;
