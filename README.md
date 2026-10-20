# Tracepad

A web platform that teaches Python to beginners. Learners read a lesson, run every example in their browser (real CPython via WebAssembly, no server, no install), and keep their progress offline-first. Persian (right-to-left) and English are both first-class.

**Status: Milestone 1 of 5 (Foundation) is complete.** See [What exists today](#what-exists-today) for exactly what that means, and [Known limitations](#known-limitations) for what does not work yet. The full plan is in [docs/PRODUCT_PROMPT.md](docs/PRODUCT_PROMPT.md).

## What exists today

- **Lesson 1** ("Python Object and Data Structure Basics", 10 chapters), imported from the original markdown with a verifier that proves no line was lost (1923 source lines, 302 blocks, 0 lost).
- **In-browser Python** (Pyodide 0.28.3 = CPython 3.13.2, self-hosted, in a Web Worker): Run, Stop, a time limit, live `input()`, and a per-user virtual disk that survives reloads. All 121 runnable examples in the lesson run; 267 snippets are checked to give the same output in Pyodide as in desktop CPython.
- **Accounts**: email or username sign-up, sign-in, password reset, email change, sign out other devices, two-factor (TOTP) screens, teacher invite code, export my data, delete my account. Learners without an account are *guests*; their progress is kept on the device and moved into the account at first sign-in.
- **Offline-first progress** with a conflict-safe sync to the database.
- **Accessibility and languages**: English and Persian (RTL, Persian digits, Jalali dates), light, dark and high-contrast themes, colour-blind palette, dyslexia-friendly font, text size 80 to 200 %, reduced motion.
- **Installable and offline** (PWA): a lesson you opened keeps working with no network.
- **Database** (Supabase/Postgres): six migrations, row-level security on every table, rate limits, audit log, feature flags, export and delete functions.

Not built yet: the learning experience (practice, quizzes, step-by-step visualiser, mastery) is Milestone 2; classes, assignments and teacher dashboards are Milestone 3; more lessons and Persian lesson text are Milestone 4; hardening, load and security review are Milestone 5.

## Quick start (development)

Requirements: Node 22, Python 3.13 with `pyyaml jsonschema`, PostgreSQL 16 binaries (only for the database tests). Optional: the [Supabase CLI](https://supabase.com/docs/guides/local-development) for a full local backend.

```bash
npm ci
npm run build            # builds lesson content, copies Pyodide, type-checks, builds the app
npm run dev              # http://localhost:5173 in guest mode (no backend needed)
```

To run with accounts, start a local Supabase (`supabase start` in this folder applies the migrations), then copy `apps/web/.env.example` to `apps/web/.env.local` and fill in the URL and anon key it prints.

> `supabase start` needs Docker and was **not** run in the environment this was built in (no Docker there). The migrations and the app's use of them were verified another way, described under "How it was verified".

## Adding or changing a lesson (a content task, not a code task)

1. Put the markdown in `content/lessons/<nn>-<slug>/lesson.md`; write the practice items in `labs.yml` and any run instructions in `blocks.yml`; list the lesson in `content/course.yml`.
2. `npm run content:build` checks everything (no lost lines, schema, safe HTML, every answer and every solution against real CPython) and fails loudly if anything is off.

## Tests

| Command | What it covers |
| --- | --- |
| `npm test` | content pipeline (7), app unit tests (36): sync merge rules, auth mapping and validation |
| `bash supabase/tests/run.sh` | 260 SQL checks on a throw-away PostgreSQL: every table and function as anonymous, student, other student, teacher, other teacher, admin |
| `python3 -I tools/content/check_labs.py ...` and `node tools/content/engine_check.mjs` | labs against CPython; Pyodide vs CPython differential (see `.github/workflows/ci.yml` for exact calls) |
| `npm run -w apps/web e2e` | 32 browser tests: axe accessibility on every page in 3 themes and 2 languages, RTL, 320 px reflow, 200 % text, offline, keyboard, CSP, runner behaviour |
| `npm run -w apps/web e2e:auth` | 13 browser tests of sign-up, sign-in, sync, offline queue, second device, guest adoption, teacher code, export, delete, reset, sign-out-others, against the real migrations (see below) |

## How it was verified

Every screen was opened in a real browser at desktop and phone width, light and dark, English and Persian. Two real bugs were found by the auth tests and fixed (a password-reset link bounced to sign-in before the code was exchanged; a duplicate username showed a generic error).

**Honest caveat on authentication.** The build environment could not run a real Supabase (no Docker, no access to its release downloads). So the auth and sync tests run the real `supabase-js` client and the real SQL migrations against a **stand-in server** (`apps/web/e2e/standin/`) that implements only the GoTrue and PostgREST calls the app makes. It is a test tool, not a product. It therefore does **not** prove: real e-mail delivery, TOTP enrolment, Google/Microsoft sign-in, GoTrue's own rate limits and password policy, or Supabase's JWT/refresh timing. Run through those once against your real project (see [docs/deployment.md](docs/deployment.md), "First-run checklist").

## Known limitations

- All progress values are **reported by the learner's browser**; the server stores them but does not verify them. Teacher views will show self-reported progress until verified grading arrives in Milestone 3.
- The under-13 sign-up block is a client-side rule only (it can be bypassed by calling the API directly). Treat it as a courtesy, and get parental or school consent in your own process.
- Lesson text is English only until Milestone 4; the interface is fully Persian. Persian lessons show a notice saying so. The 196 practice texts have Persian translations; have a Persian-speaking teacher review them before you rely on them.
- Other devices stay signed in until their short access token expires (up to one hour) after "sign out other devices"; they can no longer refresh.
- The first visit downloads about 12 MB for the Python engine; after that it is cached.
- Browsers without cross-origin isolation (or if the host omits the COOP/COEP headers) use a fallback: `input()` takes its answers from a text box before the run instead of live, and Stop restarts the engine.

## Documentation

- [docs/architecture.md](docs/architecture.md): how it fits together
- [docs/decisions.md](docs/decisions.md): every decision made and why
- [docs/database.md](docs/database.md): tables, policies, functions
- [docs/deployment.md](docs/deployment.md): hosting, headers, Supabase settings, backups
- [docs/user-guides/](docs/user-guides/): learner, teacher, administrator, in English and Persian
