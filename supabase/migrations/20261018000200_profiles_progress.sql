-- Tracepad migration 2/6: profile fields, role widening, username rules, progress sync (save_progress).
-- Idempotent.

------------------------------------------------------------------------------
-- profiles
------------------------------------------------------------------------------
alter table public.profiles add column if not exists locale text not null default 'en';
alter table public.profiles add column if not exists age_band text;               -- null until chosen; no date of birth is ever stored
alter table public.profiles add column if not exists display_prefs jsonb not null default '{}'::jsonb;

-- Widen the role list. platform_admin / content_editor can only be granted by hand (docs/database.md).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student', 'teacher', 'platform_admin', 'content_editor'));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_locale_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_locale_check check (locale in ('en', 'fa'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_age_band_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_age_band_check
      check (age_band is null or age_band in ('under13', '13_15', '16_17', 'adult'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_display_prefs_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_display_prefs_check
      check (jsonb_typeof(display_prefs) = 'object' and octet_length(display_prefs::text) < 8192);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_username_check
      check (username is null or (char_length(username) between 3 and 40 and username !~ '\s'));
  end if;
end $$;

-- Usernames are unique ignoring case ('Sara' and 'sara' are the same name).
create unique index if not exists profiles_username_lower_key on public.profiles (lower(username))
  where username is not null;

-- Sign-up: the username (if any) is taken from the sign-up metadata and fixed from then on.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')), '');
begin
  if v_name is not null and (char_length(v_name) not between 3 and 40 or v_name ~ '\s') then
    raise exception 'invalid username' using errcode = '22023';
  end if;
  if v_name is not null and exists (select 1 from public.profiles where lower(username) = lower(v_name)) then
    raise exception 'username taken' using errcode = '23505';
  end if;
  insert into public.profiles (id, full_name, username)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 80), v_name)
  on conflict (id) do nothing;
  return new;
end $$;

-- Only these columns can be changed by the signed-in user. role, username, id, created_at: never.
revoke update on public.profiles from public, anon, authenticated;
grant update (full_name, locale, age_band, display_prefs) on public.profiles to authenticated;

-- Privileged roles are never granted through the API: any change to platform_admin / content_editor
-- while a user is signed in (auth.uid() is set) is refused. Manual SQL (no JWT) is allowed.
create or replace function public.profiles_guard_role() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.role is distinct from old.role and new.role in ('platform_admin', 'content_editor')
     and auth.uid() is not null then
    raise exception 'privileged roles are granted manually' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role before update of role on public.profiles
  for each row execute function public.profiles_guard_role();

------------------------------------------------------------------------------
-- progress
------------------------------------------------------------------------------
alter table public.progress add column if not exists client_ts bigint not null default 0;  -- client clock, ms since epoch
alter table public.progress add column if not exists rev int not null default 1;             -- bumped by the server on every change

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'progress_client_ts_check' and conrelid = 'public.progress'::regclass) then
    alter table public.progress add constraint progress_client_ts_check check (client_ts >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'progress_key_format_check' and conrelid = 'public.progress'::regclass) then
    alter table public.progress add constraint progress_key_format_check check (key ~ '^[a-z0-9:_-]{1,120}$');
  end if;
end $$;

-- rev and updated_at are server-controlled, whatever the client sends.
create or replace function public.progress_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.rev := 1; else new.rev := old.rev + 1; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists progress_touch on public.progress;
create trigger progress_touch before insert or update on public.progress
  for each row execute function public.progress_touch();

-- Merge helpers (internal: not callable through the API).
-- Field-wise merge for exercise rows ('ex:*'). `newer` is the row with the later client_ts.
--   pass = OR, attempts / hints = max, every other field (including code) = the newer row's value,
--   falling back to the older row's value when the newer row does not have it.
create or replace function public._merge_ex(older jsonb, newer jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  m jsonb := coalesce(older, '{}'::jsonb) || coalesce(newer, '{}'::jsonb);
  k text; a numeric; b numeric;
begin
  if (older ->> 'pass') = 'true' or (newer ->> 'pass') = 'true' then
    m := m || jsonb_build_object('pass', true);
  end if;
  foreach k in array array['attempts', 'hints'] loop
    a := case when jsonb_typeof(older -> k) = 'number' then (older ->> k)::numeric end;
    b := case when jsonb_typeof(newer -> k) = 'number' then (newer ->> k)::numeric end;
    if a is not null or b is not null then m := m || jsonb_build_object(k, greatest(a, b)); end if;
  end loop;
  return m;
end $$;

-- Monotonic merge for 'read:*' and 'bm:*' rows: a flag that is true in either row stays true,
-- other fields come from the newer row (older row fills gaps). Nothing is ever un-read.
create or replace function public._merge_monotonic(older jsonb, newer jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(
           ks.k,
           case when (older -> ks.k) = 'true'::jsonb or (newer -> ks.k) = 'true'::jsonb
                then 'true'::jsonb else coalesce(newer -> ks.k, older -> ks.k) end), '{}'::jsonb)
  from (select jsonb_object_keys(coalesce(older, '{}'::jsonb)) as k
        union select jsonb_object_keys(coalesce(newer, '{}'::jsonb))) ks;
$$;

-- The documented write path for progress. See docs/database.md for the merge rules.
-- items: [{"key": "...", "data": {...}, "client_ts": 1760000000000}, ...] (max 200)
-- returns: {"applied": [keys], "conflicts": [{"key", "stored": {key,data,client_ts,rev,updated_at}}],
--           "rejected": [{"key", "reason"}]}
create or replace function public.save_progress(items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  it jsonb; k text; d jsonb; ts bigint;
  st public.progress; merged jsonb; new_ts bigint; n int;
  applied jsonb := '[]'::jsonb; conflicts jsonb := '[]'::jsonb; rejected jsonb := '[]'::jsonb;
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if items is null or jsonb_typeof(items) <> 'array' then
    raise exception 'items must be a json array' using errcode = '22023';
  end if;
  if jsonb_array_length(items) > 200 then
    raise exception 'too many items (max 200)' using errcode = '54000';
  end if;
  if octet_length(items::text) > 4000000 then
    raise exception 'batch too large' using errcode = '54000';
  end if;

  for it in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(it) <> 'object' then
      rejected := rejected || jsonb_build_array(jsonb_build_object('key', null, 'reason', 'item must be an object'));
      continue;
    end if;
    k := case when jsonb_typeof(it -> 'key') = 'string' then it ->> 'key' end;
    d := it -> 'data';
    if k is null or k !~ '^[a-z0-9:_-]{1,120}$' then
      rejected := rejected || jsonb_build_array(jsonb_build_object('key', k, 'reason', 'bad key'));
      continue;
    end if;
    if d is null or jsonb_typeof(d) <> 'object' then
      rejected := rejected || jsonb_build_array(jsonb_build_object('key', k, 'reason', 'data must be an object'));
      continue;
    end if;
    if octet_length(d::text) >= 200000 then
      rejected := rejected || jsonb_build_array(jsonb_build_object('key', k, 'reason', 'data too large'));
      continue;
    end if;
    if coalesce(jsonb_typeof(it -> 'client_ts'), '') <> 'number' or (it ->> 'client_ts') !~ '^[0-9]{1,15}$' then
      rejected := rejected || jsonb_build_array(jsonb_build_object('key', k, 'reason', 'bad client_ts'));
      continue;
    end if;
    ts := (it ->> 'client_ts')::bigint;
    if ts > now_ms + 86400000 then
      rejected := rejected || jsonb_build_array(jsonb_build_object('key', k, 'reason', 'client_ts is in the future'));
      continue;
    end if;

    insert into public.progress (user_id, key, data, client_ts) values (uid, k, d, ts)
      on conflict (user_id, key) do nothing;
    get diagnostics n = row_count;
    if n = 1 then
      applied := applied || to_jsonb(k);
      continue;
    end if;

    select * into st from public.progress where user_id = uid and key = k for update;
    if not found then  -- deleted between the two statements: write it again
      insert into public.progress (user_id, key, data, client_ts) values (uid, k, d, ts)
        on conflict (user_id, key) do update set data = excluded.data, client_ts = excluded.client_ts;
      applied := applied || to_jsonb(k);
      continue;
    end if;

    new_ts := greatest(ts, st.client_ts);
    if left(k, 3) = 'ex:' then
      merged := case when ts >= st.client_ts then public._merge_ex(st.data, d) else public._merge_ex(d, st.data) end;
    elsif left(k, 5) = 'read:' or left(k, 3) = 'bm:' then
      merged := case when ts >= st.client_ts then public._merge_monotonic(st.data, d) else public._merge_monotonic(d, st.data) end;
    elsif ts >= st.client_ts then
      merged := d;
    else
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('key', k, 'stored', jsonb_build_object(
        'key', st.key, 'data', st.data, 'client_ts', st.client_ts, 'rev', st.rev, 'updated_at', st.updated_at)));
      continue;
    end if;

    if merged is distinct from st.data or new_ts <> st.client_ts then
      update public.progress set data = merged, client_ts = new_ts where user_id = uid and key = k;
    end if;
    applied := applied || to_jsonb(k);
  end loop;

  return jsonb_build_object('applied', applied, 'conflicts', conflicts, 'rejected', rejected);
end $$;

revoke execute on function public.profiles_guard_role(), public.progress_touch(),
  public._merge_ex(jsonb, jsonb), public._merge_monotonic(jsonb, jsonb),
  public.save_progress(jsonb) from public, anon, authenticated;
grant execute on function public.save_progress(jsonb) to authenticated;
