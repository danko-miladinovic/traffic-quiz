# Foundation decisions

## Current defaults

- Scope: Serbia, passenger-car B category, Serbian Latin (`sr-Latn-RS`). These are reversible starting defaults selected from the plan, not a claim that an earlier specification confirmed them.
- Content: original project material with explicit source references and rights metadata. No official exam-bank reuse. All shipped questions remain DRAFT pending qualified review against current rules.
- Scoring proposal retained for phase 3: correct-answer count first, then total server-measured response time for correct answers, then a draw. Do not implement or present this as a finalized competition rule yet. The proposed 20-second timer also needs accessibility and reading-difficulty review.
- Storage: only editorial content is modeled in phase 1. Guest, practice, and duel tables will be added with their owning feature rather than guessed in advance.
- Development: npm workspaces, Node 24, Next.js App Router, Tailwind 4, Prisma 7 with the PostgreSQL adapter, and a separate Node/Socket.IO skeleton. Local PostgreSQL uses Compose. No paid infrastructure or hosting is provisioned.
- The web foundation is statically renderable and does not require a database to display its shell. Content tools validate a database URL only when they connect. Realtime configuration is validated at startup. The realtime server listens on loopback behind the intended reverse proxy and exposes no gameplay handlers.
- Next.js uses its supported Webpack mode for development and builds. Turbopack's CSS worker cannot bind its internal port in this execution environment even with elevated execution; Webpack avoids that environment-specific dependency. Revisit the faster bundler when the deployment environment is established.
- All foundation pages are no-index and robots-disallowed until useful reviewed content and public-launch requirements exist. Search controls must be revisited in phase 4.

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

These are engineering defaults, not a legal-compliance conclusion. Before collecting such data, confirm the actual controller, hosting behavior, required consent/legal basis, deletion processes, and published privacy information. Implement and test scheduled cleanup in the phases that introduce the records. No cleanup jobs are claimed to exist in phase 1.

## Remaining review gates

- Qualified reviewer approval and current-law verification for the draft bank.
- Product confirmation or adjustment of B category, script, multiplayer scoring, and question timer before those assumptions become expensive to change.
- Browser-based mobile, keyboard, and screen-reader QA before public launch.
- Public hosting, operational privacy details, and retention implementation when persistent gameplay begins.
