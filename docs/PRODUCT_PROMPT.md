# Prompt: build Tracepad as a complete, production-ready product

Copy everything below the line into a coding agent (for example Claude Code) in an empty repository.
Attach these files first: `tracepad-app.zip` (the working prototype, with `sql/schema.sql` and the Lesson 1 pipeline notes),
the Lesson 1 markdown file, and the markdown files for every later lesson as you write them.

---

## 1. Your role and the outcome

You are a senior full-stack engineer, instructional designer and accessibility specialist building **Tracepad**:
a complete, production-ready web platform that teaches Python to beginners, with accounts, classes, teachers,
grading, progress analytics and a full multi-lesson course. This is the finished product, not a prototype or MVP.
Every feature below must work end to end, be tested, be accessible, and be documented. Do not leave stubs, TODOs,
placeholder screens, fake data or "future work" in the shipped scope. If something cannot be done, say so in the
final report with the reason, and do not hide it.

Work autonomously. Do not ask me questions. When something is ambiguous, choose the most reasonable option,
write the decision and the reason into `docs/decisions.md`, and continue. Start by reading the attached prototype and
writing a plan, then build, then verify. Report only at milestones.

## 2. What the product is, and why it is different

Tracepad's idea: **predict first, then run, then see the memory.** Learners write down what they think the code will print,
run it, and see an animated diagram of names pointing to objects. Wrong guesses feed a personal watch-list of concepts
that comes back later as short reviews. The platform must feel calm, precise and friendly to people who have never coded,
and must work for people with disabilities and for Persian-speaking learners as a first-class case, not an afterthought.

Users and what each must be able to do:

- **Learner (student):** sign up, join classes, work through lessons, run and edit all code in the browser, predict outputs,
  answer quizzes, solve exercises with leveled hints, take assessments, see their own scores, streaks and mastery,
  review weak concepts, see assignments and due dates, get certificates when they finish.
- **Teacher:** create classes, invite students, assign lessons or items with due dates, see live progress, grade,
  give feedback, see which concepts the class misses, export grades, message the class, reset or extend work.
- **Co-teacher / TA:** same as teacher on classes they are added to, without the ability to delete the class.
- **School admin:** manage teachers and classes of an organization, see organization-wide reports, manage seats and settings.
- **Platform admin / content editor:** author and publish lessons, labs and assessments, manage translations, manage invite codes,
  see system health.
- **Independent learner:** can use the course without a class, with the same progress and review features.

## 3. Curriculum: all lessons

The course is a sequence of lessons. **Lesson 1 already exists** (Python Object and Data Structure Basics: numbers, variables,
strings, print formatting, lists, dictionaries, tuples, sets and booleans, files, an assessment, and an appendix with a final project).
Keep its content word for word. The following later lessons are my proposed outline; **replace or extend them with my markdown files
as I provide them** and keep this list in `content/course.yml` so it can change without code changes:

1. Object and Data Structure Basics (existing)
2. Comparison and logic operators, `if` / `elif` / `else`
3. Loops: `for`, `while`, `range`, `break`, `continue`, loop patterns
4. Methods and functions: parameters, return values, scope, `*args` / `**kwargs`, lambda
5. Comprehensions, iterators and generators (introductory)
6. Errors and exceptions: reading tracebacks, `try` / `except` / `finally`, raising, debugging method
7. Modules, packages, the standard library tour (`math`, `random`, `datetime`, `collections`, `json`, `csv`, `pathlib`)
8. Object-oriented programming: classes, objects, attributes, methods, inheritance, special methods
9. Testing and good habits: `assert`, a simple test runner, style, docstrings, type hints
10. Capstone projects (choose from several; reviewed by the teacher)

Each lesson has the same structure as Lesson 1: learning goals, explained sections with tables and runnable examples, Try It items,
homework, a short interactive lab per chapter (predictions, quizzes, exercises with hints), an end-of-lesson assessment with an answer key,
and a cheat sheet. Build the platform so that **adding a lesson is a content task, not a code task** (section 7).

## 4. Technology and architecture

Use these unless you document a better choice in `docs/decisions.md`:

- **Frontend:** TypeScript, React, Vite, a router with deep links to every chapter and section, CSS variables for theming (light, dark, high contrast),
  no heavy UI framework; a small, owned design system with the look of the prototype (calm blue, clear type, the memory diagram as the signature element).
- **Backend:** Supabase (Postgres, Auth, Row Level Security, Storage, Realtime, Edge Functions). All authorization in the database with RLS.
  Use migrations (Supabase CLI), seed scripts, and generated types.
- **Python in the browser:** self-host **Pyodide** (real CPython) in a Web Worker so runs never freeze the page, with an interrupt button, time and memory limits,
  and a virtual file system persisted per learner. Keep the prototype's Skulpt path only as a fallback if Pyodide cannot load. Provide `input()` through a UI prompt.
  The memory-model tracer must use real execution tracing (`sys.settrace`) so it works for loops, functions, classes and mutation, not only plain top-level lines.
- **Hosting:** static frontend on any CDN host, with a strict Content Security Policy, plus Supabase. Provide Docker Compose for local development
  (Supabase local stack) and a deployment guide.
- **PWA:** installable, works offline for lessons already opened, queues progress writes and syncs them when back online with conflict handling.

## 5. Learning experience (all of it required)

- **Lesson reader:** the lesson text with every code block runnable and editable, copy button, outline, search across all lessons,
  bookmarks, notes the learner can attach to any paragraph, reading progress, "mark as read", keyboard shortcuts.
- **Predict, run, compare:** the learner types a guess, runs the code, and sees match or mismatch with a plain explanation; every item is tagged with a concept.
- **Memory model:** animated, step-by-step diagram for any program, including function calls (frames), classes and objects, aliasing, mutation and garbage.
- **Error coach:** every error is shown with the line, the message and a plain-language explanation and a suggested fix, in English and Persian.
- **Exercises:** auto-graded with visible and hidden tests, comparing output and return values, with leveled hints (nudge, strategy, near-solution, solution
  only after hints), time-on-task, attempt history, plagiarism-resistant variants (parameterized tests), Parsons problems (reorder lines),
  fix-the-bug problems, and code-reading problems.
- **Mastery and review:** each concept tag has a mastery score from a documented model (for example Bayesian knowledge tracing or an Elo-style estimate);
  spaced repetition schedules short reviews (predictions and quiz items) from the watch-list; a daily review queue with a small, optional streak that never shames.
- **Assessments:** timed or untimed, randomized item order and variants, partial credit, teacher-controlled attempts, results with explanations after submission.
- **Projects:** multi-file projects in an in-browser editor with a file tree, a console, a test runner and a submission flow with teacher feedback.
- **Certificates:** verifiable PDF certificate with a public verification URL once a lesson or the course is completed to a teacher-set threshold.
- **Gamification, light and optional:** streaks, badges for learning behaviors (asked for a hint, fixed a bug, finished a review), never public leaderboards by default.

## 6. Accounts, classes and grading

- Auth: email and password, username-only accounts for learners without email (teacher creates or approves them), Google and Microsoft sign-in,
  magic link, password reset, email change, session management, optional two-factor for teachers and admins.
- Age and consent: collect date of birth or an age band; for minors require the school or parent consent flow and minimize data (COPPA, GDPR-K).
- Organizations (schools) with seats, roles (admin, teacher, TA, student), class rosters, bulk student import by CSV, bulk username and password creation with a printable credentials sheet.
- Classes: join codes with expiry and rotation, archive, duplicate to the next term, multiple teachers per class.
- Assignments: assign a lesson, a chapter, specific items or a project; start and due dates; late policy; per-student extensions; drafts; visible or hidden until released.
- Gradebook: per assignment and overall, weighting, rubric grading for projects, manual overrides with audit trail, comments, return to student, CSV and PDF export, LMS-friendly CSV.
- Teacher analytics: class heat map by chapter and concept, who is stuck (time without progress, repeated errors), hint usage, most missed items with the actual common wrong answers,
  distribution of scores, individual student timeline. Realtime updates during a live class session.
- Communication: announcements per class, comments on a submission, notifications (in-app and email) with preferences.
- Integrity: store submission code snapshots, keep hidden tests, record timing and paste events as signals (never as automatic punishment), and a teacher review screen. Be honest in the UI about what is measured.

## 7. Content system (so every lesson ships the same way)

Build a content pipeline and an editor, using what the prototype already proved:

- Markdown in, structured content out: parse each lesson markdown file into chapters, sections, tables, checklists and code blocks, and **verify that no source line is lost**
  (the prototype's `extract.py` and `verify.py` do this; port them to the build and run them in CI).
- **Differential testing in CI:** run every runnable code block and every lab item in the browser engine and in real CPython 3.13, and fail the build if outputs differ,
  except for blocks explicitly marked non-deterministic.
- Lab definitions are data (YAML or JSON validated by a schema): predictions, quizzes, exercises (starter, solution, tests, parameter substitution, hints), concept tags, and bilingual text.
  The build checks that solutions pass all tests and starters fail at least one.
- Admin content editor in the app: edit lesson text and lab items, preview exactly as learners see it, versioning with diff and rollback, draft and publish, scheduled release, per-lesson changelog.
- Translation workflow: every learner-visible string and lesson paragraph can have a translation; show missing translations in a dashboard; machine-translated drafts must be marked until a human reviews them.
  **Translate the lesson text into Persian**, not only the interface, keeping code, identifiers and output in English and left-to-right inside right-to-left text.

## 8. Accessibility, inclusion and internationalization

- WCAG 2.2 AA throughout, verified with automated checks (axe) and a manual checklist: full keyboard use, visible focus, correct landmarks and headings, live regions for run results,
  every diagram has a text alternative (the memory model must be readable as a structured list by a screen reader), no information by color alone, 200 percent zoom and 320 px width without loss.
- Learner preferences: font size, dyslexia-friendly font, line spacing, high contrast, reduced motion, color-blind-safe palette, simplified language mode for explanations.
- Languages: English and Persian complete, with a framework to add more (ICU messages, plural rules, date and number formats, Jalali calendar for Persian dates). Full RTL layout with correct bidirectional handling of code.
- Low bandwidth: the first lesson page is usable on a slow connection; large assets load on demand.

## 9. Security, privacy and operations

- RLS on every table, with automated tests (pgTAP or the prototype's SQL tests extended) proving that each role can do only what it should. Extend the prototype's 32 checks to cover every new table.
- Never trust the client for authorization. Grades that matter are computed from stored submissions and re-run in a controlled way; document exactly which scores are client-reported and which are verified.
- Rate limiting, input validation, CSP, secure cookies, dependency scanning, secrets only in environment variables, an audit log for admin and grading actions.
- Privacy: data export and account deletion for any user, retention settings per organization, a clear privacy page, no third-party trackers, privacy-first product analytics stored in your own database.
- Operations: environments (local, staging, production), CI/CD, database backups and a restore drill, error monitoring, uptime check, structured logs, feature flags, and a runbook in `docs/ops.md`.

## 10. Quality bar and tests

- Unit tests for logic (mastery, scheduling, grading, parsing), integration tests for database functions, end-to-end tests with Playwright for every user journey in section 2
  (including Persian RTL and mobile widths), visual regression snapshots of key screens, accessibility tests in CI, and performance budgets (for example first interaction under 2.5 s on a mid-range phone).
- A seeded demo organization with one teacher, one class, thirty simulated students with realistic histories, so every dashboard can be seen with data.
- Every feature has an acceptance test written before it is marked done. Nothing is "done" until the tests pass and you have looked at the real screen in a browser at desktop and phone width, light and dark, English and Persian.

## 11. Delivery

Work in milestones, each fully working and merged only when its tests pass:

1. Foundation: repository, design system, Pyodide worker, content pipeline with Lesson 1 imported and verified, auth, profiles, PWA shell.
2. Learning experience: reader, runner, tracer, labs, error coach, mastery and review, search, notes, offline.
3. Classes and teaching: organizations, classes, assignments, gradebook, teacher analytics, notifications, exports.
4. Content at scale: editor, versioning, translations, all remaining lessons imported, assessments, projects, certificates.
5. Hardening: accessibility audit and fixes, security review, performance, load test with thousands of learners, backup drill, documentation, demo data, release.

At each milestone, update `README.md`, `docs/architecture.md`, `docs/decisions.md`, and `docs/user-guides/` (one guide for learners, one for teachers, one for admins, in English and Persian).

**Final deliverables:** the repository, a one-command local setup, a staging deployment guide, the seeded demo, all documentation, the test reports,
and a final report listing what was built, what was verified and how, known limitations, and recommended next steps.
