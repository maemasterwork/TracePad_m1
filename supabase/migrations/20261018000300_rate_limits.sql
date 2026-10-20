-- Tracepad migration 3/6: rate limiting, wired into join_class and claim_teacher. Idempotent.

-- Fixed-window counters, one row per (user, bucket, window). Internal table: RLS on, no policies, no grants.
create table if not exists public.rate_limits (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  bucket        text not null check (char_length(bucket) between 1 and 64),
  window_start  timestamptz not null,
  hits          int not null default 0,
  constraint rate_limits_pkey primary key (user_id, bucket, window_start)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from public, anon, authenticated;

-- Count one hit for the signed-in user. Returns true while within max_hits per window, false once over.
-- Internal (not callable through the API): other security definer functions call it.
-- NOTE: callers that then RAISE roll the increment back with the rest of their transaction; the counter
-- therefore only grows through calls that complete. join_class returns normally for wrong codes for this reason.
create or replace function public.check_rate(bucket text, max_hits int, window_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_start timestamptz;
  v_hits int;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if bucket is null or char_length(bucket) not between 1 and 64 or max_hits is null or max_hits < 1
     or window_seconds is null or window_seconds < 1 then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / window_seconds) * window_seconds);
  insert into public.rate_limits as r (user_id, bucket, window_start, hits) values (v_uid, bucket, v_start, 1)
    on conflict on constraint rate_limits_pkey do update set hits = r.hits + 1
    returning r.hits into v_hits;
  return v_hits <= max_hits;
end $$;

-- Delete counters from old windows. Run it from a scheduler (pg_cron or an edge function using the service role).
create or replace function public.cleanup_rate_limits(max_age interval default interval '1 day') returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.rate_limits where window_start < now() - max_age;
  get diagnostics n = row_count;
  return n;
end $$;

-- claim_teacher: 5 tries per 10 minutes. Platform admins and other roles are never changed by it.
create or replace function public.claim_teacher(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.check_rate('claim_teacher', 5, 600) then
    raise exception 'rate limited' using errcode = 'P0001';
  end if;
  select exists (select 1 from public.app_settings where key = 'teacher_code' and value = p_code
                 and value <> 'CHANGE-ME-BEFORE-SHARING') into ok;
  if not ok then return false; end if;
  update public.profiles set role = 'teacher' where id = auth.uid() and role = 'student';
  return exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher');
end $$;

-- join_class: 10 tries per minute. An unknown code returns NO ROWS (it no longer raises P0002):
-- raising would roll back the attempt counter and make guessing unthrottled.
create or replace function public.join_class(p_code text) returns table (id uuid, name text)
language plpgsql security definer set search_path = public as $$
declare c public.classes;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.check_rate('join_class', 10, 60) then
    raise exception 'rate limited' using errcode = 'P0001';
  end if;
  select * into c from public.classes where join_code = upper(trim(p_code));
  if not found then return; end if;
  insert into public.enrollments (class_id, student_id) values (c.id, auth.uid()) on conflict do nothing;
  return query select c.id, c.name;
end $$;

revoke execute on function public.check_rate(text, int, int), public.cleanup_rate_limits(interval)
  from public, anon, authenticated;
revoke execute on function public.claim_teacher(text), public.join_class(text) from public, anon;
grant execute on function public.claim_teacher(text), public.join_class(text) to authenticated;
