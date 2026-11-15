# Verification history

## Phase 3 — 2026-11-15

Verified with Node 24.22.2 and a disposable PostgreSQL 18 runtime. Checks did not use the development database. The PostgreSQL 17 Compose/CI service was not exercised locally.

| Check                            | Result                                                                                                                                                                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma generation and migrations | Passed; all five migrations applied, including normalized duel state, immutable snapshots/answers, and guest lookup index                                                                                                                                       |
| Formatting and TypeScript        | Passed across workspaces, test files, and Playwright configuration                                                                                                                                                                                              |
| Domain tests                     | 11 passed, covering practice and duel scoring, ties, server deadlines, input validation, answer privacy, and reconnection expiry                                                                                                                                |
| PostgreSQL regression tests      | 10 passed including subtests; practice and content publication behavior remain intact with duel retention cleanup                                                                                                                                               |
| Realtime integration tests       | 9 passed including subtests; cookie/origin authentication, room authorization, duplicate actions, frozen published revisions, shared rounds, rematches, reconnect deadlines, expiry, restart reconciliation, and exclusive process ownership                    |
| Concurrent games                 | 20 rooms / 40 clients completed five rounds each; approximately 2.9 seconds total and 219 ms accepted-answer acknowledgement p95 while database regression tests also ran. This is a local baseline, not a hosting capacity guarantee                           |
| Browser tests                    | 16 passed across desktop and Pixel-sized Chromium: existing practice flows plus QR decoding, independent participants, identical questions/results, room fullness, rematches, refresh/reconnection, interrupted games, and HTTP polling with WebSockets blocked |
| Visual checks                    | Inspected desktop/mobile invitation and result screenshots; QR contents were decoded and checked against the invitation URL                                                                                                                                     |
| Production builds                | Next.js Webpack and bundled realtime server passed                                                                                                                                                                                                              |
| Production HTTP checks           | Passed for the built practice flow, scoring/resume, private responses, secure guest cookie, and disabled development demo                                                                                                                                       |
| Built realtime checks            | Passed for five shared published-fixture rounds, identical results, guest authentication, and disabled development demo even when its environment flag is set                                                                                                   |
| Dependency audit                 | npm reported zero known vulnerabilities at installation time                                                                                                                                                                                                    |

All gameplay checks used synthetic demo questions or explicitly marked fixtures in the disposable database. Supplied traffic questions remain unpublished; no reviewer identity or approval was fabricated. CI now includes realtime integration checks, but no remote GitHub Actions result is claimed.

Browser mobile checks used emulation. Physical-phone QR scanning, screen-reader review, public-host WebSocket/proxy behavior, backup/log operations, and qualified educational content review remain launch gates. No site was deployed. Temporary verification services were stopped after checks.

## Phase 2 — 2026-11-13

Verified with Node 24.22.2 and a disposable PostgreSQL 18 runtime. Docker is unavailable in this environment; the PostgreSQL 17 Compose/CI service remains configured but was not exercised locally.

| Check                            | Result                                                                                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prisma generation and migrations | Passed; all three committed migrations applied, including practice tables and snapshot/answer update guards                                                                                                                                                                                |
| Formatting and TypeScript        | Passed for workspaces, test files, and Playwright configuration                                                                                                                                                                                                                            |
| Domain tests                     | 6 passed, including practice scoring and rejection of forged inputs                                                                                                                                                                                                                        |
| PostgreSQL tests                 | 10 passed including subtests: publication filtering, concurrent retries, private ownership, frozen revisions, sequential answers, scoring, resume, demo gating, quotas, expiry and cascading cleanup                                                                                       |
| Browser tests                    | 10 passed across desktop and Pixel-sized Chromium; completion, incorrect feedback, results review, retry, refresh, lost start/answer responses, offline recovery, keyboard focus, cookie privacy, guest isolation, origin rejection, request-size limits, service errors and empty content |
| Visual checks                    | Inspected desktop and mobile question/result screenshots; mobile flow also passed a horizontal-overflow check                                                                                                                                                                              |
| Production builds                | Next.js Webpack and realtime skeleton passed; website shell stayed static and practice APIs are dynamic                                                                                                                                                                                    |
| Production HTTP checks           | Passed on the built server using synthetic published database fixtures: complete practice, stable start replay, scoring, resume, private/no-store responses, guest protection, Secure/HttpOnly/SameSite cookie, and disabled demo despite its environment flag being set                   |
| Dependency audit                 | npm reported zero known vulnerabilities at installation time                                                                                                                                                                                                                               |

Concurrency checks exposed both ordinary serialization conflicts and PostgreSQL adapter failures at COMMIT. The shared transaction helper now retries these specific conflicts with bounded backoff. Content imports use it too, so concurrent editorial imports do not fail immediately on a retryable conflict.

The original traffic bank was not modified or published. Browser walkthroughs used unrelated synthetic questions; database/production checks used isolated, explicitly marked automated fixtures. No reviewer approval of educational content is claimed.

Browser checks used emulation, not physical phones or a screen reader. Qualified content review, real-device/screen-reader QA, public-host configuration, and operational privacy/backup/log review remain launch gates. CI was updated to run these checks, but no remote GitHub Actions result is claimed. Temporary verification servers were stopped afterward; no site was deployed.

## Phase 1 verification

Verified locally on 2026-11-10 using Node 24.22.2. No hosted environment was provisioned.

| Check                                      | Result                                                                                                                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency installation and package lock   | Passed; npm audit reported zero known vulnerabilities at installation time                                                                                                                      |
| Prisma client generation                   | Passed                                                                                                                                                                                          |
| Formatting and workspace TypeScript checks | Passed                                                                                                                                                                                          |
| Domain tests                               | 4 passed: seed validation, invalid content rejection, publication evidence/immutability, environment validation                                                                                 |
| Content validation and draft import        | Passed for all five supplied questions and the referenced SVG                                                                                                                                   |
| Committed PostgreSQL migrations            | Both applied successfully to a disposable database                                                                                                                                              |
| PostgreSQL integration test                | Passed: repeated import, draft/reviewed filtering, explicit publishing flag, locale separation, answer-key exclusion, immutable published question/options, newest published revision selection |
| Production builds                          | Realtime service and Next.js Webpack build passed; web routes were statically rendered                                                                                                          |
| HTTP smoke checks                          | Passed for homepage, practice/duel information pages, about page, CSS asset, SVG, 404, no-index metadata and robots restrictions                                                                |
| Realtime smoke checks                      | Health returned OK; untrusted origin rejected; gameplay connection rejected with the intended unavailable message                                                                               |

Docker and system PostgreSQL were unavailable in the execution environment. Database checks used a temporary PostgreSQL 18 runtime under `/tmp`, not the Compose service. Compose and CI are configured for PostgreSQL 17; that exact container was not exercised locally. CI configuration was added but has not been observed running on GitHub.

The sandbox blocked local sockets and some child-process streams. Socket-dependent checks required elevated execution. Next.js Turbopack's internal CSS worker remained blocked; the documented scripts use supported Webpack mode, which built successfully. Temporary test services were stopped after verification.

Browser rendering, responsive screenshots, keyboard interaction, and screen-reader behavior were not exercised by a browser tool in this environment. The interface includes responsive CSS, semantic landmarks, a skip link, focus indicators, explicit labels, reduced-motion support, and accessible native controls, but these still require browser/device QA.

All supplied educational questions remain DRAFT. No qualified reviewer approval is claimed, and no draft answer key is exposed by the public-content query. Gameplay, analytics, advertising, public deployment, and final legal/privacy readiness are outside this phase.
