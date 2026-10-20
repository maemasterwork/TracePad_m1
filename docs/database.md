# Tracepad database (Milestone 1)

Supabase / PostgreSQL 15+. Source of truth: `supabase/migrations/*.sql` (idempotent, applied in filename order).
`supabase/prototype_schema.sql` is the old single-file prototype and is superseded by the migrations.

| Migration | Contents |
|---|---|
| `20261018000100_core.sql` | default privileges, profiles, app_settings, classes, enrollments, assignments, progress, helpers, RLS, claim_teacher, join_class, class_progress |
| `20261018000200_profiles_progress.sql` | locale / age_band / display_prefs, wider role list, username rules, role guard, progress `client_ts` / `rev`, `save_progress` |
| `20261018000300_rate_limits.sql` | `rate_limits`, `check_rate`, `cleanup_rate_limits`, limits on join_class and claim_teacher |
| `20261018000400_audit_flags_analytics.sql` | `audit_log`, `write_audit`, `feature_flags`, `analytics_events` |
| `20261018000500_privacy.sql` | `export_my_data`, `delete_my_account` |
| `20261018000600_hardening.sql` | final sweep: RLS on, nothing for anon/PUBLIC on every public table and function |

## Tables

| Table | Purpose | Notes |
|---|---|---|
| `profiles` | one per auth user (created by trigger `handle_new_user`, always role `student`) | `role` in student/teacher/platform_admin/content_editor; `locale` en/fa; `age_band` null/under13/13_15/16_17/adult; `display_prefs` jsonb < 8 KB; `username` unique ignoring case. No date of birth anywhere. |
| `app_settings` | secrets (teacher invite code) | no policy, no grant: only security definer functions read it |
| `classes`, `enrollments`, `assignments` | classes, membership, assignments | joining only via `join_class()` |
| `progress` | one row per `(user_id, key)` | `client_ts` bigint (client clock, ms), `rev` int (server counter), `data` jsonb < 200 KB; key matches `[a-z0-9:_-]{1,120}` |
| `rate_limits` | fixed-window counters per user and bucket | internal, no policy, no grant |
| `audit_log` | append-only record of privileged actions | triggers refuse UPDATE, DELETE and TRUNCATE for everyone, including the owner |
| `feature_flags` | `key`, `enabled`, `rollout` jsonb, `updated_at` | changes audited by trigger |
| `analytics_events` | privacy-first events | `user_id` set null when the account is deleted; `name` charset `[a-z0-9._:-]` <= 64, `session` <= 64, `props` object < 4 KB |

## RLS matrix

R = read, C = create, U = update, D = delete. "own" = rows whose owner is the caller. "-" = denied (grant missing or RLS filters everything). Anon has nothing anywhere.
A student's teacher = a teacher with a class that the student joined. platform_admin gets no special access outside the rows listed.

| Table | anon | student (own) | other student | student's teacher | unrelated teacher | platform_admin |
|---|---|---|---|---|---|---|
| profiles | - | R own; U only full_name, locale, age_band, display_prefs | - | R their students | - | R own |
| app_settings | - | - | - | - | - | - (manual SQL only) |
| classes | - | R joined | - | R, C, U, D own | C own only | - |
| enrollments | - | R, D own (leave) | - | R, D in own classes | - | - |
| assignments | - | R of joined classes | - | R, C, U, D own classes | - | - |
| progress | - | R, C, U, D own (use `save_progress`) | - | R only | - | - |
| rate_limits | - | - | - | - | - | - |
| audit_log | - | - (sees 0 rows) | - | - | - | R |
| feature_flags | - | R | R | R | R | R, C, U, D |
| analytics_events | - | C (own user_id or null) | C (same) | C (same) | C (same) | R, C |

Functions (all `security definer` with a fixed `search_path`; `anon` and PUBLIC may execute none):
`claim_teacher`, `join_class`, `class_progress` (teacher of that class only), `save_progress`, `write_audit`, `export_my_data`, `delete_my_account` and the policy helpers `is_teacher`, `is_admin`, `teaches_class`, `in_class`, `teaches_student` are executable by `authenticated`.
`check_rate`, `cleanup_rate_limits`, `_audit`, `_merge_ex`, `_merge_monotonic`, `handle_new_user` and the trigger functions are internal (no one can call them through the API).

## save_progress(items jsonb) returns jsonb

`items` = `[{"key": "...", "data": {...}, "client_ts": 1760000000000}, ...]`, at most 200 items. Always writes to the caller's own rows.
Returns `{"applied": [keys], "conflicts": [{"key", "stored": {key,data,client_ts,rev,updated_at}}], "rejected": [{"key","reason"}]}`.

Validation (a bad item is listed in `rejected`, the rest of the batch still applies): key `[a-z0-9:_-]{1,120}`; `data` a JSON object under 200 KB; `client_ts` a non-negative integer not more than one day in the future. More than 200 items or a non-array raises an error.

Merge rules when a row already exists (S = stored, I = incoming; "newer" = larger `client_ts`, ties go to the incoming write):

| Key | Rule |
|---|---|
| default (`pred:`, `quiz:`, `cl:`, `miss:`, `meta:` ...) | last writer wins by `client_ts`. If `I.client_ts < S.client_ts` the write is NOT applied and the stored row comes back in `conflicts`. |
| `ex:*` | field-wise merge, never a conflict: `pass` = OR, `attempts` and `hints` = max, every other field (e.g. `code`) from the newer row, falling back to the older row if absent. `client_ts` becomes the max. |
| `read:*`, `bm:*` | monotonic: any flag that is `true` in either row stays `true` (never un-read); other fields from the newer row. No conflict. |

`rev` is bumped by a trigger on every change; `updated_at` is set by the server. Direct INSERT/UPDATE on `progress` is still allowed by RLS (own rows) but has no merge logic; the app should use `save_progress`.

## What is client-reported and what is verified

**In Milestone 1, ALL of `progress.data` is client-reported.** The browser runs the exercises and reports `pass`, `right`, `hints`, `attempts`, code, quiz choices; the server stores and aggregates them (`class_progress`) but verifies nothing. A student can write any value to their own rows, so teacher dashboards show self-reported progress, not graded results. Verified, server-recomputed grading from stored submissions arrives with the gradebook (Milestone 3). Server-controlled values: `rev`, `updated_at`, `profiles.role`, class membership, audit entries, rate counters.

## Granting platform_admin / content_editor

Never possible through the API: the role column is not writable by `authenticated`, and a trigger (`profiles_guard_role`) refuses a change to these roles whenever a JWT user is present. Grant by hand in the SQL editor / psql as the database owner:

```sql
update public.profiles set role = 'platform_admin' where id = (select id from auth.users where email = 'you@example.com');
```
`claim_teacher` never changes a non-student. Set the teacher code once: `update public.app_settings set value = '<long random string>' where key = 'teacher_code';` (the placeholder value is refused).
`delete_my_account` refuses these roles, so remove such accounts by hand.

## Tests

```
bash supabase/tests/run.sh
```
Needs PostgreSQL 16 binaries (`/usr/lib/postgresql/*/bin`). It creates a scratch cluster under `/tmp` (unix socket, free port), applies `shim.sql`, all migrations and `seed.sql` twice, runs `checks.sh` (prototype checks, new-table checks for anon / student / second student / the teacher / unrelated teacher / platform_admin, META checks) and deletes the cluster. The last line is `N checks passed, F failed`; exit status is non-zero on failure. It also fails when `apps/web/src/db/types.ts` is stale.
Regenerate types after changing a migration: `python3 supabase/gen_types.py`.
When you add a table: add it to `export_my_data` (a META check fails otherwise) and bump the table count in the META check.

## Decisions

1. **join_class returns no rows for an unknown code** (the prototype raised `P0002 No class has that code`). Raising rolls back the rate-limit counter, which would make code guessing unlimited. Frontend: treat an empty result as "no class has that code". Over the limit it raises `P0001 rate limited` (10 calls per 60 s per user). claim_teacher: 5 per 600 s, same error; a wrong code still returns `false`.
2. `claim_teacher` only promotes `student` rows (it can never demote platform_admin / content_editor) and refuses the placeholder code.
3. Extra role guard trigger besides the missing column grant: defence in depth for privileged roles.
4. Username is set at sign-up from metadata only and is not user-editable (case-insensitive unique; 3 to 40 chars, no whitespace). Sign-up fails with `username taken` / `invalid username`.
5. `save_progress` adds a `rejected` list to the requested `{applied, conflicts}` so one bad item does not fail a 200-item offline batch. Future-dated `client_ts` (> 1 day) is rejected so a broken clock cannot freeze a row.
6. `audit_log.actor` has no foreign key so entries survive account deletion; the `account.delete` row keeps only the old user id and role. `write_audit` refuses the `account.`, `flag.`, `role.`, `admin.` namespaces so clients cannot forge server events; those are written by `_audit` from triggers/functions. `audit_log` TRUNCATE is blocked too.
7. Non-admin SELECT on `audit_log` and `analytics_events` returns zero rows (RLS) rather than an error; anon gets `permission denied`. Users insert analytics with only `user_id, session, name, props`; `id` and `at` are server-set. There is no insert throttle on analytics yet (add one before launch if abuse appears).
8. `export_my_data` returns the caller's own rows from every table that holds user data plus the auth e-mail. A teacher's export has their classes and assignments but not rosters or students' data (those belong to the students). Anonymous analytics events (user_id null) cannot be linked to a person and are not included. `rate_limits` and audit entries where actor = caller are included.
9. `delete_my_account` cascades profile, progress, enrollments, rate counters and, for teachers, their classes, assignments and enrollments (students lose that class). Analytics rows stay with `user_id` null. Needs the function owner (`postgres` on Supabase) to be allowed to delete from `auth.users`.
10. Default privileges: migration 1 revokes EXECUTE from PUBLIC and all privileges from anon/authenticated for new functions, tables and sequences created by the migration role (also `postgres`/`supabase_admin` when permitted). Migration 6 re-asserts this over existing objects. Anything new needs explicit grants.
11. Direct writes to `progress` stay allowed for the owner (prototype behaviour); `rev`/`updated_at` are forced by trigger. Teachers only ever read.
12. `supabase/config.toml` targets Postgres 17 locally (tests run on 16; the SQL is 15+ compatible). Email confirmations are on, `site_url` is `http://localhost:5173`.
13. Milestone 3 (organizations, gradebook, classes v2) is not started; tables are keyed by uuid and policy helpers are functions, so org-aware helpers can replace `teaches_class` / `teaches_student` without touching table shapes.
14. `types.ts` is generated, includes Row/Insert/Update for every table (even internal ones, which the API cannot reach) and typed args for `save_progress` / results for `export_my_data`.
