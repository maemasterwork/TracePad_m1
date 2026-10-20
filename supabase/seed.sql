-- Local development seed (supabase db reset). Idempotent and free of personal data.
-- The teacher invite code lives in public.app_settings. Set a real one before sharing a deployment:
--   update public.app_settings set value = 'a-long-random-string' where key = 'teacher_code';
-- (claim_teacher refuses the shipped placeholder, so nobody can become a teacher until you do.)
insert into public.feature_flags (key, enabled, rollout) values
  ('maintenance_banner', false, '{}'),
  ('classes_beta',       true,  '{}')
on conflict (key) do nothing;
