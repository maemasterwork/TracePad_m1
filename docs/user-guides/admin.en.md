# Administrator guide (English)

The full set-up is in [../deployment.md](../deployment.md). This page is the short list of what an administrator does.

**Set up once**: create the Supabase project, apply the migrations, set the teacher invite code, configure e-mail (custom SMTP) and the site URL, build and host the site with the required headers, then do the first-run checklist.

**Teachers**: give them the invite code (keep it secret and change it with one SQL statement when needed). They become teachers in Account. Nobody can become a teacher or an administrator through the app without the code; `platform_admin` and `content_editor` can only be granted by running SQL as the database owner:
`update public.profiles set role = 'platform_admin' where id = (select id from auth.users where email = '...');`

**Learners without email**: they sign in with `username@<VITE_USERNAME_DOMAIN>`. If one forgets the password, reset it in Supabase *Authentication → Users*. To remove a learner, delete the user there (their progress goes with them).

**Accounts for learners under 13**: they cannot self-register. In Supabase *Authentication → Users → Add user*, use `username@<VITE_USERNAME_DOMAIN>`, set a password, tick auto-confirm, and put `{"full_name": "...", "username": "...", "age_band": "under13"}` in user metadata. (Not tried in the build environment; try it with one account first.) A class-based way to do this comes with Milestone 3.

**Privacy requests**: learners can download and delete their own data in Account. Platform roles cannot self-delete; remove them by hand.

**Feature flags and audit log**: `feature_flags` (switch features, show a maintenance banner) and `audit_log` (account deletions, role and flag changes) are readable and writable only by platform admins, in SQL for now; an admin screen arrives in a later milestone.

**Adding lessons**: a content task; see the README. Run `npm run content:build`, redeploy.

**Backups and monitoring**: turn on Supabase backups and test a restore. There is no built-in error monitoring yet (planned for hardening).
