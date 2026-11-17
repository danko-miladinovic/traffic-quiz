# Foundation decisions

## Current defaults

- Scope: Serbia, passenger-car B category, Serbian Latin (`sr-Latn-RS`). These are reversible starting defaults selected from the plan, not a claim that an earlier specification confirmed them.
- Content: original project material with explicit source references and rights metadata. No official exam-bank reuse. All shipped questions remain DRAFT pending qualified review against current rules.
- Phase 3 implements correct-answer count first, then total server-measured response time for correct answers, then a draw. The default question timer and reconnect grace are 20 seconds, with four seconds for shared explanations. Timings are server-configurable and still need accessibility/reading-difficulty review before public launch.
- Storage: phase 2 adds GuestSession, PracticeAttempt, PracticeQuestion snapshots, and PracticeAnswer. Phase 3 adds Duel, DuelPlayer, DuelQuestion snapshots, and DuelAnswer, with one realtime process owning a database advisory lock before reconciliation.
- Development: npm workspaces, Node 24, Next.js App Router, Tailwind 4, Prisma 7 with the PostgreSQL adapter, and a separate persistent Node/Socket.IO service. Local PostgreSQL uses Compose. No paid infrastructure or hosting is provisioned.
- The web foundation is statically renderable and does not require a database to display its shell. Content tools validate a database URL only when they connect. Realtime configuration is validated at startup. The realtime server listens on loopback behind the intended reverse proxy and serves authenticated gameplay handlers.
- Next.js uses its supported Webpack mode for development and builds. Turbopack's CSS worker cannot bind its internal port in this execution environment even with elevated execution; Webpack avoids that environment-specific dependency. Revisit the faster bundler when the deployment environment is established.
- Phase 4 adds build-time SITE_URL and SEARCH_INDEXING_ENABLED settings. Indexing stays disabled by default. Only published lessons and populated categories qualify for sitemaps/indexing; gameplay remains noindex. Lesson files are validated and statically rendered without database access; publishing or withdrawal requires rebuild/deployment. See docs/education.md.
- Socket.IO uses the existing HttpOnly guest cookie through a same-origin website proxy. Invitation URLs use fragments and grant joining rights only. Automatic slash redirects are disabled to preserve the Socket.IO handshake; add educational-page canonical/redirect handling deliberately in phase 4.

## Retention defaults for later feature implementation

The foundation collects no guest identities, answers, analytics, or ad data. Draft a minimal retention policy now so later schemas do not acquire unbounded personal data:

| Data                                     | Proposed retention                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Guest credentials                        | Expire after 30 days of inactivity; remove expired records within 24 hours                  |
| Invitation tokens / abandoned rooms      | Expire after 15 minutes; purge secrets within 24 hours                                      |
| Raw practice/duel records                | 30 days, then delete or irreversibly aggregate                                              |
| Application request/security logs        | 7 days; redact tokens and avoid full IP storage unless a documented operational need exists |
| Non-identifying aggregate counters       | 13 months                                                                                   |
| Reviewed content and immutable revisions | Retain for editorial/history purposes, with minimal reviewer details                        |
| Backups                                  | Rolling 30-day expiry, with deletion behavior documented before launch                      |

Phase 2 implements 30-day guest inactivity expiry, 24-hour active-attempt expiry, and 30-day raw practice retention. The persistent web process cleans on first database use and hourly; data:cleanup supports an independent daily scheduler. See docs/practice.md. Other rows above remain defaults for future infrastructure/features. Before public launch, confirm the actual controller, hosting behavior, required consent/legal basis, backup/log retention, and published privacy information. These are engineering defaults, not a legal-compliance conclusion.

Phase 3 extends cleanup to raw duel records and duels involving expired guest sessions. Invitations expire after 15 minutes and their persisted hash is removed at play start or termination. Terminal runtime rooms without connections are evicted after five minutes. Restarts abort unfinished games; no restart-transparent recovery or high availability is promised.

## Remaining review gates

- Qualified reviewer approval and current-law verification for the draft bank.
- Product confirmation or adjustment of B category, script, multiplayer scoring, and question timer before those assumptions become expensive to change.
- Browser-based mobile, keyboard, and screen-reader QA before public launch.
- Public hosting, operational privacy details, monitoring of practice cleanup, and backup/log retention.
