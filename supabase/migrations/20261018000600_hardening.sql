-- Tracepad migration 6/6: final sweep. Idempotent. Re-asserts the deny-by-default model over EVERYTHING
-- currently in schema public (so a table or function added by an earlier migration cannot slip through).
--   * RLS on for every table; nothing granted to anon / PUBLIC on any table or sequence.
--   * No function in public is executable by anon / PUBLIC (grant to authenticated explicitly where wanted).
-- Only objects owned by the migration role and not part of an extension are touched.
do $$
declare r record;
begin
  for r in select c.oid::regclass as rel, c.relkind from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p', 'S') and c.relowner = (select oid from pg_roles where rolname = current_user)
             and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') loop
    if r.relkind = 'S' then
      execute format('revoke all on sequence %s from public, anon', r.rel);
    else
      execute format('alter table %s enable row level security', r.rel);
      execute format('revoke all on table %s from public, anon', r.rel);
    end if;
  end loop;

  for r in select p.oid::regprocedure as fn from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' and p.proowner = (select oid from pg_roles where rolname = current_user)
             and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
    execute format('revoke execute on function %s from public, anon', r.fn);
  end loop;
end $$;

-- Table and function privileges for NEW objects were revoked in migration 1 (alter default privileges).
-- Schema usage stays open for the API roles; without table/function grants it exposes nothing.
revoke create on schema public from public, anon, authenticated;
