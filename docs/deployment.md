# Deployment

## 1. Supabase
1. Create a project (pick a region near your learners; this decides where their data lives).
2. Apply the migrations in `supabase/migrations/` in order (CLI: `supabase link --project-ref <ref> && supabase db push`; or paste each file into the SQL editor). They are safe to re-run.
3. Optional: `supabase/seed.sql` only inserts two feature flags (it is a development seed and contains no personal data).
4. **Set the teacher invite code** (nobody can become a teacher until you do):
   `update public.app_settings set value = '<long random string>' where key = 'teacher_code';`
5. Authentication settings: *Email* provider on; **Confirm email** on if everyone has a real address, off if you want username-only learners (they then have no way to reset a password; an admin must do it in *Authentication → Users*). Set **Site URL** and add `https://<your site>/auth/update-password` to the redirect URLs. Set a custom SMTP provider before real use (Supabase's built-in mailer is heavily rate limited). Enable TOTP under *Multi-factor*. Optional: Google/Microsoft providers, then list them in `VITE_OAUTH_PROVIDERS`.
6. Grant platform roles by hand (see database.md). Never put the `service_role` key in the app.

## 2. The site
`npm ci && npm run build` with these variables set (they are public and are baked into the bundle):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optionally `VITE_OAUTH_PROVIDERS`, `VITE_USERNAME_DOMAIN`.
Serve `apps/web/dist` over HTTPS. **The host must send the headers in `dist/_headers`** (Netlify and Cloudflare Pages read that file as is). For other hosts copy them into the server config. The important ones: `Content-Security-Policy` (its `connect-src` already names your Supabase origin), `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, and long caching for `/assets/*` and `/pyodide/*`. Without COOP/COEP the app still works but uses the `input()` and Stop fallback.
Single-page routing: unknown paths must serve `index.html`.

## 3. First-run checklist (do this once; the automated tests cannot)
- Sign up with a real email: the confirmation mail arrives, the link signs you in.
- Reset the password from the mail link.
- Enable two-factor in *Account*, sign out, sign in with a code.
- If you enabled Google/Microsoft: sign in with each.
- Claim the teacher code with a second account; check a wrong code is refused.
- "Download my data" and "Delete my account" on a throw-away account.
- Open the lesson, run an example, press Stop on `while True: pass`, turn the network off and reload.

## 4. Operations
- **Backups**: enable Supabase daily backups (paid plans) or schedule `pg_dump`; test a restore before launch.
- **Rate limits** are inside the database functions (`join_class` 10 per minute, `claim_teacher` 5 per 10 minutes); GoTrue has its own, set in the dashboard.
- **Audit log** (`audit_log`) records account deletions, role changes and flag changes; only platform admins can read it.
- **Updating content**: add or edit lesson files, run `npm run content:build`, redeploy. Learner progress is keyed by stable item ids, so editing text does not lose progress; renaming ids does.
- **Privacy**: the database holds names, usernames or emails, an age band and learning activity. Tell learners and parents, follow your school's rules, and use the export/delete functions for access requests.
