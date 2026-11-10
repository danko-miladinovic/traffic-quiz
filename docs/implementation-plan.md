# Implementation plan

## Scope and assumptions

Build Saobraćajni Duel as a free educational website for Serbia. Visitors can practice without an account or invite a friend to a five-question duel through a link or QR code. Original lessons attract search visitors and lead naturally into relevant quizzes. Ads are a later revenue source, not a condition of play.

The referenced earlier project specification is unavailable. These are proposed defaults, not recovered requirements:

- Start with passenger-car preparation content; confirm the initial licence category and approved question sources before producing the content bank.
- Start with Serbian Latin UI and content (`sr-Latn-RS`), with an explicit script field for future Cyrillic support.
- Duels are private invitation rooms, without public matchmaking, chat, accounts, or leaderboards.
- Both players receive the same five questions, in the same order, with the same answer ordering. The server advances both players together after both answer or the deadline expires.
- Rank by number of correct answers, then lower accumulated server-measured time for correct answers. Exact ties produce a draw. An unanswered question is incorrect. Validate this scoring rule before implementing it.
- A proposed question deadline is 20 seconds, configurable on the server. Validate it for reading difficulty and accessibility before launch.
- Guest identity uses a scoped credential, not a personal profile. Optional display names do not establish identity.

## Architecture and trade-offs

Use one repository with a Next.js web application and a small persistent Node/Socket.IO service sharing domain types and scoring logic. PostgreSQL stores reviewed content and durable game records through Prisma. Server-render or statically generate public educational pages; keep interactive quizzes in client components with server validation.

Proposed structure:

```text
apps/web                 Next.js routes, UI, HTTP endpoints
apps/realtime            Socket.IO room lifecycle and authoritative scoring
packages/domain          validated payloads, scoring, shared types
packages/db              Prisma schema, migrations, content import
content                  original lesson sources and reviewed seed content
```

Two processes add some deployment coordination, but keep realtime lifecycle management independent of page rendering and allow conventional Next.js hosting. Initially run both on a single small host behind a reverse proxy, with managed PostgreSQL if affordable. Prefer same-origin socket routing to simplify cookie and connection handling. A single-host deployment limits availability and capacity; that is an explicit initial cost trade-off.

Keep active timers and room coordination in realtime-process memory, with durable lifecycle transitions and submissions in PostgreSQL. A process restart marks interrupted duels as aborted when the service reconciles active records; never silently declare a winner. Deploys may interrupt active duels in this first version. Use graceful draining where practical. Do not promise restart-transparent recovery in the MVP.

Scale only after measuring connections, latency, and database load. Multiple realtime instances would require shared room coordination, distributed timers/locking, an appropriate Socket.IO adapter, and routing compatible with the selected transports. An adapter alone does not make in-memory game state distributed.

## Data and authority

Suggested persistent models:

| Model                                         | Purpose                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Jurisdiction / ContentLocale                  | Country, language, script, and content boundaries                                                         |
| Category                                      | Reviewed quiz grouping and public landing-page metadata                                                   |
| QuestionRevision / AnswerOption               | Immutable published question text, answer keys, explanations, source references, rights, and review dates |
| Lesson                                        | Localized slug, original content, metadata, review status, sources, and related categories                |
| GuestSession                                  | Expiring pseudonymous session with hashed credential material                                             |
| PracticeAttempt / PracticeAnswer              | Selected revision IDs, submissions, completion, and computed results                                      |
| Duel / DuelPlayer / DuelQuestion / DuelAnswer | Room lifecycle, participants, frozen question revisions, timing, submissions, and outcomes                |

Enforce unique player/question submissions and transactional state transitions. Published revisions remain immutable so content updates cannot alter an ongoing game or its recorded result. Expire guest credentials and delete or aggregate old gameplay data according to a documented retention schedule.

Expose only question prompts and options during a round. Return answer keys and explanations after both players have answered or the round deadline has passed. Practice validation also happens server-side. Use opaque, unguessable invitation tokens with expiry; invitation tokens permit joining, while separate guest credentials authorize participant actions. Never put participant credentials in QR codes.

## Phase 1 — Foundation and content

Implementation status: foundation source and checks are implemented. See [foundation decisions](foundation-decisions.md), the [content workflow](../content/README.md), and [verification results](verification.md). Builds, PostgreSQL integration, and HTTP checks pass. The five supplied examples remain drafts pending qualified review; this phase is not an assertion of educational launch readiness. Browser/device accessibility QA remains pending.

- Scaffold the chosen stack, environment validation, formatting, type checks, CI, and Prisma migrations.
- Create the mobile layout, Serbian UI copy, navigation, and shared accessible controls.
- Implement the content schema and a validated import/publish workflow. A full editorial CMS is deferred; reviewed source files and imports are sufficient initially.
- Assemble a small representative question bank with original explanations and properly licensed images. Record source, jurisdiction, review date, and reviewer status.
- Decide the initial licence category, script, scoring rule, content rights, and retention policy.

Acceptance: a clean checkout can run against a local database using documented commands; migrations and validated seed import work; unreviewed content is excluded from public queries; secrets are absent from source control.

## Phase 2 — Practice quizzes

- Add category selection, quiz start, answer submission, progress, completion, explanations, and retry.
- Keep the entire flow anonymous. Provide useful loading, empty, offline, and retry states without duplicating submissions.
- Freeze question revisions per attempt and validate selected answers on the server.
- Reserve typed event hooks for later analytics without loading a tracking provider yet.

Acceptance: a visitor completes a quiz on a phone without registration, sees accurate explanations and results, and can retry. Automated checks cover answer validation, scoring, duplicate submissions, and attempt completion; keyboard and screen-reader checks cover the core flow.

## Phase 3 — Private multiplayer duels

- Create an expiring room, copyable invitation URL, locally generated QR code, waiting room, and two-player ready state. The URL must also work without scanning a QR code.
- Implement server states: waiting, ready, active round, round result, finished, expired, and aborted.
- Schedule rounds using server timestamps; acknowledge accepted answers and compute outcomes from server receipt times. Network latency affects speed scoring, so accuracy remains the primary ranking criterion.
- Define a short reconnection grace period using the existing participant credential. Keep the original deadline running; reconnecting must not reset it. If a participant fails to return, abort the duel without recording a competitive winner in the MVP.
- Reject extra players, stale answers, forged participant actions, and repeated submissions. Rate-limit room creation and joins, and clean up abandoned rooms.
- Add final results, mutual rematch acceptance, and a new challenge link. Sharing uses an explicit button and does not disclose credentials.

Acceptance: two browsers can join by QR/link, answer the same five questions, and see identical server-computed outcomes. Integration checks cover full rooms, expired invitations, answer races, ties, deadlines, disconnects, reconnects, and restart reconciliation. A small concurrent-room load check establishes an initial capacity baseline.

## Phase 4 — Educational pages and SEO

- Publish homepage, category pages, and reviewed lessons for signs, right of way, intersection scenarios, exam preparation, and common mistakes.
- Use descriptive localized URLs, unique titles/descriptions, semantic headings, canonical URLs, sitemap, robots configuration, and relevant social preview metadata.
- Render useful lesson content in initial HTML. Link lessons to related lessons and quizzes. Keep private room and result URLs out of search indexes and sitemaps.
- Add accurate structured data only where the page content supports it; do not promise search features or rankings.
- Optimize illustrations and fonts, reserve media space, and check performance and accessibility on representative mobile pages.

Acceptance: public lessons are readable without client JavaScript, metadata is unique, sitemap contains only published public pages, private routes carry appropriate no-index directives, and reviewed pages provide original explanations rather than thin generated content. Indexing controls do not replace room authorization.

## Phase 5 — Privacy-conscious analytics

- Select an analytics approach after assessing hosting cost, data processing, consent requirements, and metric limitations. Avoid collecting unnecessary personal information.
- Define events: page view, practice started, question answered, practice completed, duel created, invite action, player joined, duel started, duel completed, rematch requested, and challenge shared.
- Count server-confirmed gameplay outcomes once using event IDs. Do not send both client and server copies of the same completion event.
- Define visits as sessions with a documented inactivity threshold; define active users as pseudonymous visitors with an accepted activity event. Distinguish visits from gameplay attempts.
- Report daily/monthly active users, visits, page views, average accepted answers per session, practice completion rate, created/completed duels, and returning visitors.
- Define invitation rate as distinct duel creators who invoke copy/share divided by distinct duel creators. Track successful friend joins separately: an invite action cannot prove delivery or that the recipient is a friend.
- Attribute organic, direct, social, and referral traffic from sanitized landing/referrer data; exclude invitation tokens and sensitive query parameters. Where identifiers or consent are unavailable, label unique-user and returning-user metrics as estimates with reduced coverage.

Acceptance: event payloads and retention are documented, duplicate events do not inflate completion metrics, aggregate reports match a controlled test session, and required consent behavior is verified before analytics is enabled.

## Phase 6 — Advertising placeholders

- Implement a reusable `AdSlot` with placement IDs, reserved dimensions, accessible labeling, and a provider interface. Default the feature flag to disabled; preview placeholders in development.
- Allow placements on the homepage, articles, category pages, practice results, and completed duel results.
- Explicitly exclude active duel questions. Keep slots separated from answer, navigation, rematch, and share controls; reserve space to prevent layout shifts.
- Model provider choice behind configuration so a future direct sponsor can use the same placement system. Do not implement advertiser accounts, campaigns, billing, or a management dashboard.

Acceptance: no advertising network requests occur, disabled slots do not leave unnecessary production gaps, preview slots do not shift surrounding content, and gameplay layouts enforce placement restrictions.

## Phase 7 — Launch and advertising readiness

- Before public launch, complete content review, privacy information, security checks, database backups with a restore exercise, health monitoring, and an operational runbook.
- Configure secure cookies, HTTPS, origin checks, payload limits, abuse limits, and redacted logs. Confirm reverse-proxy WebSocket support and graceful shutdown behavior.
- Review current Google Publisher/AdSense requirements and applicable privacy and consent obligations for Serbia and other served regions with qualified support where needed. Verify policies at implementation time; this plan does not claim eligibility or legal compliance.
- Enable a real advertising provider only after content and policy readiness, the appropriate review process, and a separate release decision. No arbitrary article count guarantees approval.
- After activation, use provider reporting for revenue and Page RPM; compare revenue with retention, performance, and completion metrics. Do not transmit gameplay identities to the ad provider.

Acceptance: recovery procedures work, core practice/duel flows pass on target devices, production analytics honors the chosen privacy approach, and real advertising remains off until its separate launch gate is satisfied.

## Sequencing and scope control

Deliver each phase as a reviewable milestone. Practice can launch before multiplayer; public lessons can then expand steadily through an editorial process. Analytics hooks belong in earlier feature work, but external collection is introduced in phase 5. Advertising can remain disabled indefinitely without blocking the product.

No schedule is committed before content sourcing and the initial gameplay decisions are resolved. Estimate phases after the foundation milestone demonstrates deployment and content import. The largest uncertainties are content production/review, multiplayer reconnection behavior, and the privacy/provider review needed for analytics and ads.

Defer accounts, public matchmaking, leaderboards, chat, native apps, payments, advertiser management, multi-instance realtime coordination, and additional-country content until evidence supports their cost. Preserve country and locale boundaries now without translating or duplicating Serbian traffic rules for other jurisdictions.
