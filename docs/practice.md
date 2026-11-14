# Practice quizzes (phase 2)

Anonymous practice is available at `/vezbanje`. PostgreSQL is required for category availability, sessions, submissions, and results; the public website shell still renders without it.

## Try it locally

Use Node 24. Install dependencies, generate Prisma, start your local PostgreSQL service, and apply all migrations:

```sh
npm ci
npm run db:generate
docker compose up -d --wait
npm run db:migrate
npm run content:import
```

Keep your existing root `.env`; create it from `.env.example` if needed. The web application now loads the root `.env` too. `DATABASE_URL` must point at your development database. `WEB_ORIGIN` must exactly match the browser origin, usually `http://localhost:3000`.

The supplied traffic questions remain DRAFT. Importing them will show the three categories with zero available questions. This is intentional. Do not mark them reviewed just to try the interface.

For a full technical walkthrough without publishing unreviewed traffic content:

```sh
PRACTICE_DEMO=true npm run dev
```

Open http://localhost:3000/vezbanje and choose **Tehnička proba**. Its five synthetic questions concern symbols and simple counting, not traffic rules. Try an incorrect answer, finish the attempt, expand the review, retry, or refresh partway through. The demo uses the same persistent attempt/submission/scoring flow. It never inserts or publishes a QuestionRevision and never invents a reviewer. The flag is ignored in production; existing demo attempts are also inaccessible when demo mode is off.

Normal practice selects only the newest PUBLISHED revision per question in the selected Serbian-Latin B-category bank. Each attempt uses up to five distinct questions. Small categories use their available question count. See [content workflow](../content/README.md) for actual review and publication.

## Behavior and authority

- The server shuffles questions and answer choices, freezes their text/options/explanations/sources and revision IDs, and keeps their order stable for that attempt.
- Only the current unanswered question and feedback for the latest accepted answer are returned. Its correct answer and explanation appear after submission; the complete review appears only after completion.
- Attempts advance sequentially and have no timer. Score is the number of correct accepted answers; percentage is rounded to the nearest integer. This is not the timed duel scoring system.
- Creating an attempt requires a client-generated UUID replay key scoped to the guest. Replaying it returns the existing attempt; a new explicit retry creates a new attempt.
- Repeating the same answer is idempotent. Changing an accepted answer, answering ahead, submitting another attempt's question, or supplying a score is rejected. Database transactions retry bounded PostgreSQL serialization conflicts, including adapter commit failures.
- Guest-row updates serialize writes. Snapshot and answer updates are prohibited by database triggers; old published revisions remain unchanged.
- On an uncertain network failure the UI retains the submission and offers the same retry or a server-state refresh. Tab-scoped sessionStorage stores only attempt/request IDs, never credentials. Reload restores the current attempt and accepted feedback; clearing that storage removes automatic resume in that tab. Results remain private to the guest cookie.

## API and privacy

| Endpoint                                  | Purpose                                                 |
| ----------------------------------------- | ------------------------------------------------------- |
| `GET /api/practice/categories`            | Category metadata and published question counts         |
| `POST /api/practice/session`              | Create/renew a functional guest cookie                  |
| `POST /api/practice/attempts`             | Start/replay an attempt using categoryKey and requestId |
| `GET /api/practice/attempts/:id`          | Retrieve the owner's current state                      |
| `POST /api/practice/attempts/:id/answers` | Submit questionId and optionKey                         |

The random 256-bit guest credential is held in an HttpOnly, SameSite=Lax cookie; production adds Secure and therefore requires HTTPS. Only its SHA-256 hash is stored in PostgreSQL. No registration, names, email, IP-address analytics, ad requests, or analytics provider are introduced. Guest credentials never enter URLs or response bodies. Gameplay responses are private/no-store and no-index.

Every write validates Origin against WEB_ORIGIN and rejects cross-site fetches. JSON input is bounded to 2 KiB. Per-process in-memory guards cap anonymous/session request rates and bucket growth without storing IPs; a database-backed limit permits at most ten new attempts per guest per minute. These are MVP limits, not distributed edge abuse protection. Do not trust forwarded IP/origin headers without a deliberate proxy configuration.

The server exposes optional typed event hooks for practice_started, question_answered, and practice_completed. Accepted actions produce stable opaque event IDs; replayed requests produce no duplicate hook calls. No hook/provider is connected by default. Hooks are best-effort after commit and have no delivery guarantee; add durable event delivery and consent behavior when analytics is implemented in phase 5.

## Retention

Active attempts expire after 24 hours. Completed results are available until deletion. Guest sessions expire after 30 days of inactivity; attempt records are deleted after 30 days from creation, cascading to their question snapshots and answers. Expired guests cascade-delete their remaining attempts.

The long-running Next.js process cleans at first database use and hourly thereafter. Cleanup is idempotent across processes. For deployments with process suspension or to run cleanup independently, schedule this command at least daily:

```sh
npm run data:cleanup
```

Cleanup failures produce a redacted error message. Monitor that message and verify the scheduler before launch. Cleanup only applies to gameplay records; editorial revisions are retained. No host scheduler or backup system has been provisioned by this change. Backups and operator logs still require their own documented retention configuration before public launch.

## Tests

Run unit checks and a production build using the README commands. For database/browser tests use an explicitly **disposable** migrated database through TEST_DATABASE_URL. The integration suite inserts synthetic published fixtures and may delete expired gameplay records. Never point it at production.

```sh
# Example when using the supplied local Compose credentials:
docker compose exec postgres createdb -U duel duel_test
DATABASE_URL=postgresql://duel:duel_local_only@localhost:5432/duel_test npm run db:migrate
TEST_DATABASE_URL=postgresql://duel:duel_local_only@localhost:5432/duel_test npm run test:db
npx playwright install chromium
TEST_DATABASE_URL=postgresql://duel:duel_local_only@localhost:5432/duel_test npm run test:e2e
```

Browser tests start and stop their own development server on port 3310 with synthetic demo mode enabled. Stop any other Next.js dev process for this checkout first to avoid its development lock. Tests run desktop and Pixel-sized Chromium scenarios covering completion, incorrect-answer feedback, refresh/resume, retry, lost start/answer responses, offline recovery, keyboard focus, cookie protection, cross-guest access, cross-origin writes, service errors, and empty content. They are browser emulation, not a substitute for real-device and screen-reader review.
