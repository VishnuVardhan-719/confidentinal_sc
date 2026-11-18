-- Shared helpers for the pgTAP-style suites; \ir-included inside each suite's transaction.
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.expect_state(statement text,expected text,label text) returns void language plpgsql as $$
declare actual text; begin
  begin execute statement; exception when others then
    get stacked diagnostics actual=returned_sqlstate;
    if actual=expected then return; end if;
    raise exception 'FAIL: %, expected %, got %',label,expected,actual;
  end;
  raise exception 'FAIL: %, unexpectedly succeeded',label;
end $$;
