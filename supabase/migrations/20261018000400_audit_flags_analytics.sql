-- Tracepad migration 4/6: audit_log (append-only), feature_flags, analytics_events. Idempotent.

------------------------------------------------------------------------------
-- audit_log: append-only. Written only through write_audit() (API) or _audit() (internal definer code).
------------------------------------------------------------------------------
create table if not exists public.audit_log (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  actor   uuid,                       -- auth.uid() of the caller; NO foreign key so rows outlive the account
  action  text not null check (action ~ '^[a-z0-9._:-]{1,64}$'),
  target  text not null default '' check (char_length(target) <= 200),
  details jsonb not null default '{}'::jsonb
          check (jsonb_typeof(details) = 'object' and octet_length(details::text) < 4096)
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor);
alter table public.audit_log enable row level security;

create or replace function public.audit_log_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end $$;
drop trigger if exists audit_log_no_update on public.audit_log;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated using (public.is_admin());

-- Internal writer (not callable through the API). Actor is always the signed-in user (null for manual SQL).
create or replace function public._audit(p_action text, p_target text, p_details jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  insert into public.audit_log (actor, action, target, details)
  values (auth.uid(), p_action, coalesce(p_target, ''), coalesce(p_details, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

-- API writer for client-side events worth auditing (e.g. 'user.consent'). Namespaces 'account.', 'flag.',
-- 'role.' and 'admin.' are reserved for the server and refused here, so entries cannot be forged.
create or replace function public.write_audit(action text, target text default '', details jsonb default '{}'::jsonb)
returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if action is null or action !~ '^[a-z0-9._:-]{1,64}$' then
    raise exception 'bad action' using errcode = '22023';
  end if;
  if action ~ '^(account|flag|role|admin)\.' then
    raise exception 'reserved action namespace' using errcode = '42501';
  end if;
  if coalesce(char_length(target), 0) > 200 then raise exception 'target too long' using errcode = '22023'; end if;
  if details is not null and (jsonb_typeof(details) <> 'object' or octet_length(details::text) >= 4096) then
    raise exception 'bad details' using errcode = '22023';
  end if;
  return public._audit(action, target, details);
end $$;

------------------------------------------------------------------------------
-- feature_flags: everyone signed in reads; only platform_admin writes; every change is audited.
------------------------------------------------------------------------------
create table if not exists public.feature_flags (
  key        text primary key check (key ~ '^[a-z0-9._:-]{1,64}$'),
  enabled    boolean not null default false,
  rollout    jsonb not null default '{}'::jsonb
             check (jsonb_typeof(rollout) = 'object' and octet_length(rollout::text) < 4096),
  updated_at timestamptz not null default now()
);
alter table public.feature_flags enable row level security;

drop policy if exists feature_flags_select on public.feature_flags;
create policy feature_flags_select on public.feature_flags for select to authenticated using (true);
drop policy if exists feature_flags_insert on public.feature_flags;
create policy feature_flags_insert on public.feature_flags for insert to authenticated with check (public.is_admin());
drop policy if exists feature_flags_update on public.feature_flags;
create policy feature_flags_update on public.feature_flags for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists feature_flags_delete on public.feature_flags;
create policy feature_flags_delete on public.feature_flags for delete to authenticated using (public.is_admin());

create or replace function public.feature_flags_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists feature_flags_touch on public.feature_flags;
create trigger feature_flags_touch before update on public.feature_flags
  for each row execute function public.feature_flags_touch();

-- AFTER triggers: only rows that were really written are audited (ON CONFLICT DO NOTHING audits nothing).
create or replace function public.feature_flags_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public._audit('flag.delete', old.key, jsonb_build_object('old', to_jsonb(old)));
    return old;
  elsif tg_op = 'INSERT' then
    perform public._audit('flag.insert', new.key, jsonb_build_object('new', to_jsonb(new)));
  else
    perform public._audit('flag.update', new.key, jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)));
  end if;
  return new;
end $$;
drop trigger if exists feature_flags_audit_ins_upd on public.feature_flags;
drop trigger if exists feature_flags_audit_del on public.feature_flags;
drop trigger if exists feature_flags_audit on public.feature_flags;
create trigger feature_flags_audit after insert or update or delete on public.feature_flags
  for each row execute function public.feature_flags_audit();

------------------------------------------------------------------------------
-- analytics_events: product analytics without PII (no names, e-mails, free text, IPs).
------------------------------------------------------------------------------
create table if not exists public.analytics_events (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  user_id  uuid references public.profiles (id) on delete set null,
  session  text check (session is null or char_length(session) <= 64),
  name     text not null check (name ~ '^[a-z0-9._:-]{1,64}$'),
  props    jsonb not null default '{}'::jsonb
           check (jsonb_typeof(props) = 'object' and octet_length(props::text) < 4096)
);
create index if not exists analytics_events_at_idx on public.analytics_events (at desc);
create index if not exists analytics_events_user_idx on public.analytics_events (user_id);
alter table public.analytics_events enable row level security;

drop policy if exists analytics_events_insert on public.analytics_events;
create policy analytics_events_insert on public.analytics_events for insert to authenticated
  with check (user_id is null or user_id = auth.uid());
drop policy if exists analytics_events_select on public.analytics_events;
create policy analytics_events_select on public.analytics_events for select to authenticated using (public.is_admin());

------------------------------------------------------------------------------
-- Grants
------------------------------------------------------------------------------
revoke all on public.audit_log, public.feature_flags, public.analytics_events from public, anon, authenticated;
grant select on public.audit_log to authenticated;                      -- RLS: platform_admin only
grant select, insert, update, delete on public.feature_flags to authenticated;  -- RLS: writes platform_admin only
grant select on public.analytics_events to authenticated;               -- RLS: platform_admin only
grant insert (user_id, session, name, props) on public.analytics_events to authenticated;  -- id and at are server-set

revoke execute on function public.audit_log_immutable(), public._audit(text, text, jsonb),
  public.feature_flags_audit(), public.feature_flags_touch(), public.write_audit(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.write_audit(text, text, jsonb) to authenticated;
