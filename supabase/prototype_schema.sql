-- Tracepad: database schema for Supabase (Postgres 15+).
-- Run this whole file once in the Supabase SQL editor (Project > SQL Editor > New query > paste > Run).
-- Safe to re-run: every statement is idempotent.

------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  username    text,
  role        text not null default 'student' check (role in ('student', 'teacher')),
  created_at  timestamptz not null default now()
);

-- Secrets used by the app (currently only the teacher invite code). No policies on purpose:
-- nobody can read this table through the API; only the security-definer functions below can.
create table if not exists public.app_settings (
  key    text primary key,
  value  text not null
);
insert into public.app_settings (key, value) values ('teacher_code', 'CHANGE-ME-BEFORE-SHARING')
  on conflict (key) do nothing;

create table if not exists public.classes (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 80),
  join_code   text not null unique,
  created_at  timestamptz not null default now()
);
create index if not exists classes_teacher_idx on public.classes (teacher_id);

create table if not exists public.enrollments (
  class_id    uuid not null references public.classes (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (class_id, student_id)
);
create index if not exists enrollments_student_idx on public.enrollments (student_id);

create table if not exists public.assignments (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes (id) on delete cascade,
  page_id     text not null,                 -- chapter id such as '3-strings'
  title       text not null default '',
  due_at      timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists assignments_class_idx on public.assignments (class_id);

-- One row per thing a learner did. key examples:
--   pred:3:p1   quiz:3:q1   ex:3:e1   read:3   cl:3-l1   miss:float-eq   meta:prefs   meta:vfs
create table if not exists public.progress (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  key         text not null check (length(key) <= 120),
  data        jsonb not null default '{}'::jsonb check (pg_column_size(data) < 200000),
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);

------------------------------------------------------------------------------
-- Helper functions (security definer so policies never recurse into each other)
------------------------------------------------------------------------------
create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher');
$$;

create or replace function public.teaches_class(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classes where id = p_class and teacher_id = auth.uid())
     and public.is_teacher();
$$;

create or replace function public.in_class(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.enrollments where class_id = p_class and student_id = auth.uid());
$$;

create or replace function public.teaches_student(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_teacher() and exists (
    select 1 from public.enrollments e join public.classes c on c.id = e.class_id
    where e.student_id = p_student and c.teacher_id = auth.uid());
$$;

------------------------------------------------------------------------------
-- New accounts: always start as a student. The profile is filled from sign-up metadata.
------------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, username)
  values (new.id,
          left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 80),
          nullif(left(coalesce(new.raw_user_meta_data ->> 'username', ''), 40), ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------------------
-- Row level security
------------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.app_settings enable row level security;
alter table public.classes     enable row level security;
alter table public.enrollments enable row level security;
alter table public.assignments enable row level security;
alter table public.progress    enable row level security;

-- profiles: read yourself, and teachers read their own students. Only the name is editable.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.teaches_student(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (full_name) on public.profiles to authenticated;

-- classes: teachers manage their own; students see the classes they joined.
drop policy if exists classes_select on public.classes;
create policy classes_select on public.classes for select to authenticated
  using (teacher_id = auth.uid() or public.in_class(id));
drop policy if exists classes_insert on public.classes;
create policy classes_insert on public.classes for insert to authenticated
  with check (teacher_id = auth.uid() and public.is_teacher());
drop policy if exists classes_update on public.classes;
create policy classes_update on public.classes for update to authenticated
  using (public.teaches_class(id)) with check (teacher_id = auth.uid());
drop policy if exists classes_delete on public.classes;
create policy classes_delete on public.classes for delete to authenticated
  using (public.teaches_class(id));

-- enrollments: students see and leave their own; teachers see and remove students in their classes.
drop policy if exists enrollments_select on public.enrollments;
create policy enrollments_select on public.enrollments for select to authenticated
  using (student_id = auth.uid() or public.teaches_class(class_id));
drop policy if exists enrollments_delete on public.enrollments;
create policy enrollments_delete on public.enrollments for delete to authenticated
  using (student_id = auth.uid() or public.teaches_class(class_id));
-- (joining goes through join_class() below, never a direct insert)

-- assignments: teachers manage them; enrolled students read them.
drop policy if exists assignments_select on public.assignments;
create policy assignments_select on public.assignments for select to authenticated
  using (public.teaches_class(class_id) or public.in_class(class_id));
drop policy if exists assignments_write on public.assignments;
create policy assignments_write on public.assignments for all to authenticated
  using (public.teaches_class(class_id)) with check (public.teaches_class(class_id));

-- progress: you own your rows; teachers can read (never change) their students' rows.
drop policy if exists progress_select on public.progress;
create policy progress_select on public.progress for select to authenticated
  using (user_id = auth.uid() or public.teaches_student(user_id));
drop policy if exists progress_insert on public.progress;
create policy progress_insert on public.progress for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists progress_update on public.progress;
create policy progress_update on public.progress for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists progress_delete on public.progress;
create policy progress_delete on public.progress for delete to authenticated
  using (user_id = auth.uid());

------------------------------------------------------------------------------
-- Functions the app calls
------------------------------------------------------------------------------
-- Become a teacher by presenting the invite code stored in app_settings.
create or replace function public.claim_teacher(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select exists (select 1 from public.app_settings where key = 'teacher_code' and value = p_code
                 and value <> 'CHANGE-ME-BEFORE-SHARING') into ok;
  if not ok then return false; end if;
  update public.profiles set role = 'teacher' where id = auth.uid();
  return true;
end $$;

-- Join a class by its code. Returns the class (id and name only).
create or replace function public.join_class(p_code text) returns table (id uuid, name text)
language plpgsql security definer set search_path = public as $$
declare c public.classes;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into c from public.classes where join_code = upper(trim(p_code));
  if not found then raise exception 'No class has that code' using errcode = 'P0002'; end if;
  insert into public.enrollments (class_id, student_id) values (c.id, auth.uid()) on conflict do nothing;
  return query select c.id, c.name;
end $$;

-- Per student and chapter totals for a teacher's class (keeps the dashboard to one small request).
create or replace function public.class_progress(p_class uuid)
returns table (student_id uuid, ch int, preds int, preds_right int, quizzes int, quizzes_right int,
               ex_pass int, ex_tried int, hints int, is_read boolean, last_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.teaches_class(p_class) then raise exception 'not your class' using errcode = '42501'; end if;
  return query
  select p.user_id,
         nullif(split_part(p.key, ':', 2), '')::int as ch,
         count(*) filter (where split_part(p.key, ':', 1) = 'pred')::int,
         count(*) filter (where split_part(p.key, ':', 1) = 'pred' and p.data ->> 'right' = 'true')::int,
         count(*) filter (where split_part(p.key, ':', 1) = 'quiz')::int,
         count(*) filter (where split_part(p.key, ':', 1) = 'quiz' and p.data ->> 'right' = 'true')::int,
         count(*) filter (where split_part(p.key, ':', 1) = 'ex' and p.data ->> 'pass' = 'true')::int,
         count(*) filter (where split_part(p.key, ':', 1) = 'ex')::int,
         coalesce(sum((p.data ->> 'hints')::int) filter (where split_part(p.key, ':', 1) = 'ex'), 0)::int,
         bool_or(split_part(p.key, ':', 1) = 'read'),
         max(p.updated_at)
  from public.progress p
  join public.enrollments e on e.student_id = p.user_id and e.class_id = p_class
  where split_part(p.key, ':', 1) in ('pred', 'quiz', 'ex', 'read')
    and split_part(p.key, ':', 2) ~ '^[0-9]+$'
  group by p.user_id, nullif(split_part(p.key, ':', 2), '')::int;
end $$;

grant execute on function public.claim_teacher(text), public.join_class(text),
  public.class_progress(uuid) to authenticated;
revoke execute on function public.claim_teacher(text), public.join_class(text),
  public.class_progress(uuid) from anon, public;
-- Helper functions are used inside policies; keep them callable by signed-in users only.
revoke execute on function public.is_teacher(), public.teaches_class(uuid), public.in_class(uuid),
  public.teaches_student(uuid) from anon, public;
grant execute on function public.is_teacher(), public.teaches_class(uuid), public.in_class(uuid),
  public.teaches_student(uuid) to authenticated;

grant select, insert, update, delete on public.progress to authenticated;
grant select, insert, update, delete on public.classes, public.assignments to authenticated;
grant select, delete on public.enrollments to authenticated;
grant select on public.profiles to authenticated;
