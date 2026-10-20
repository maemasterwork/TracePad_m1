-- Tracepad migration 5/6: privacy. export_my_data() and delete_my_account(). Idempotent.
-- When you add a table that holds user data, add it to export_my_data (the test suite fails if you forget).

create or replace function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email) from auth.users u where u.id = uid),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = uid),
    'progress', coalesce((select jsonb_agg(to_jsonb(x) order by x.key) from public.progress x where x.user_id = uid), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(x)) from public.enrollments x where x.student_id = uid), '[]'::jsonb),
    -- Classes you teach and their assignments. Other people's rows (rosters) are not part of your export.
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from public.classes x where x.teacher_id = uid), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(to_jsonb(a)) from public.assignments a
                             join public.classes c on c.id = a.class_id where c.teacher_id = uid), '[]'::jsonb),
    'analytics_events', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.analytics_events x where x.user_id = uid), '[]'::jsonb),
    'audit_log', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.audit_log x where x.actor = uid), '[]'::jsonb),
    'rate_limits', coalesce((select jsonb_agg(to_jsonb(x)) from public.rate_limits x where x.user_id = uid), '[]'::jsonb)
  );
end $$;

-- Deletes the caller's account. Cascades: profile, progress, enrollments, rate counters; for a teacher also
-- their classes, assignments and those classes' enrollments. analytics_events rows stay but lose user_id.
-- The audit row ('account.delete', actor = the old user id, no other personal data) is kept on purpose.
-- platform_admin / content_editor accounts are removed by hand, never through the API.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_role text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select role into v_role from public.profiles where id = uid;
  if v_role is null then raise exception 'no such account' using errcode = 'P0002'; end if;
  if v_role in ('platform_admin', 'content_editor') then
    raise exception 'privileged accounts are removed manually' using errcode = '42501';
  end if;
  perform public._audit('account.delete', uid::text, jsonb_build_object('role', v_role));
  delete from auth.users where id = uid;
end $$;

revoke execute on function public.export_my_data(), public.delete_my_account() from public, anon;
grant execute on function public.export_my_data(), public.delete_my_account() to authenticated;
