# Phase 1 verification

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
