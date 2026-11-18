# Private multiplayer duels (phase 3)

`/duel` supports private, anonymous two-player games with five shared questions, invitation links, locally generated QR codes, synchronized rounds, server scoring, reconnects, results and mutual rematches. Practice remains available separately without a timer.

## Local setup

Use Node 24, the existing root `.env`, and a running PostgreSQL database. From the repository root:

```sh
npm ci
npm run db:generate
# If the supplied Docker database is stopped:
sudo docker compose up -d --wait
npm run db:migrate
npm run content:import
PRACTICE_DEMO=true npm run dev
```

The root dev command runs both Next.js and the persistent realtime service. Running only `@duel/web` is sufficient for practice but cannot run multiplayer. Check the realtime service at http://localhost:3001/health. Its startup requires the database, committed migrations, and exclusive ownership of that database's realtime lock.

Open http://localhost:3000/duel and create a **Tehnička proba** room. Open its invitation in a second browser profile, private browsing context, or device. Two tabs sharing the same cookie represent one guest and cannot occupy both seats. Mark both players ready, answer the same five questions, review the result, and request a rematch from both sides.

The supplied traffic bank remains DRAFT. Real educational duels require at least five distinct published questions in a category. The opt-in technical walkthrough uses the existing synthetic symbol/counting questions and never publishes or changes the educational bank. Demo rooms are inaccessible when demo mode is off. Both production web builds and realtime builds disable the demo even if PRACTICE_DEMO is set.

## QR codes on a phone

A phone cannot reach your computer through `localhost`. For testing on your local network, set WEB_ORIGIN in the root `.env` to the computer's reachable address, for example `http://192.168.1.50:3000`, restart both services, and open that same address on the computer and phone. Next.js must be reachable on port 3000. The realtime process can stay on loopback because the website proxies its connections.

For public use, configure the actual HTTPS site origin and hosting first. Never expose PostgreSQL publicly. QR generation runs locally in the browser; no external QR service receives the invitation.

## Rules

- Both players receive the same five frozen question revisions in the same order, with identical shuffled answer choices.
- A one-second preparation interval precedes each round. The default answer deadline is 20 seconds.
- An answer is accepted once, using server receipt time. Identical retries return the current state; changed, invalid, early, late, foreign, or stale answers are rejected. Clients cannot supply a seat, score, or response time.
- Correctness, explanations, and individual choices are revealed together after both answers or the deadline. Public scores exclude the still-open question.
- The default explanation interval is four seconds. Then both players advance together. If a player is disconnected, the current deadline still runs; subsequent advancement waits for their return or aborts when their grace period expires.
- Rank first by correct-answer count, then by total server-measured time for correct answers only. Incorrect or missing answers add no correct answers and do not affect the speed tiebreak. An exact tie is a draw.
- Network latency affects response timing. Accuracy takes priority; this game is not an official driving exam or a latency-compensated esports system.
- After completion, each player must explicitly request the rematch. A fresh durable room is created once, with new frozen/shuffled content and another ready check. Leaving withdraws a pending rematch request; a new challenge creates a separate invitation.

Timings are server configuration, not client input:

| Variable               | Default                                              |
| ---------------------- | ---------------------------------------------------- |
| WEB_ORIGIN             | Required site origin, normally http://localhost:3000 |
| REALTIME_PORT          | 3001                                                 |
| DUEL_QUESTION_SECONDS  | 20                                                   |
| DUEL_REVEAL_SECONDS    | 4                                                    |
| DUEL_RECONNECT_SECONDS | 20                                                   |
| PRACTICE_DEMO          | false; development only                              |

Restart the realtime process after changing timings. Rules are frozen per game. The 20-second question/grace defaults still require accessibility and real-device review before launch.

## Connection and invitation security

The website first establishes the existing HttpOnly guest cookie. Socket.IO authenticates its hash against GuestSession, with the same origin restrictions as the web app. There is no login, public matchmaking, chat, name field, or bearer credential in browser JavaScript.

Next.js proxies `/socket.io/` to the loopback realtime process. The proxy preserves the backend's trailing slash; automatic Next.js slash redirects are disabled because handshake clients cannot follow them reliably. WebSocket and HTTP polling are supported and tested. Keep this exception when adding page-level canonical URLs/redirects for SEO. REALTIME_PORT is used when generating the Next.js rewrite, so configure it before building as well as when starting services.

Invitations use random 256-bit tokens. Only a SHA-256 hash is persisted. The raw token is held in realtime memory and returned only to the host while the room is in the lobby. The URL puts it in a fragment (`/duel#poziv=...`), which is not sent in the HTTP page request. The recipient consumes it over the authenticated socket and removes it from the visible URL after joining. A token grants only permission to request the second seat; it never authorizes acting as an existing player. The token expires after 15 minutes and is removed when play starts or the room ends.

Every action validates its payload and guest membership. Private per-player channels receive projections, never the internal game object. Payload size, connection counts, per-guest event rates, new-room creation rates, and in-memory room/bucket counts are bounded. There can be only one active duel per guest. These are single-instance MVP controls, not distributed edge protection. Invitation tokens, guest credentials, raw socket payloads, and answers must not enter analytics or request logs.

## Persistence, failures, and operations

The service uses a steady monotonic clock anchored to server wall time. Receipt timestamps are captured before asynchronous command queues; database latency does not inflate an already received answer's score. The server serializes mutations per room and orders actions from each socket. State is committed before acknowledgement/broadcast. Database constraints protect seats, timing, accepted answers, and frozen snapshots. An optimistic version check catches unexpected competing writers.

Duel, DuelPlayer, DuelQuestion, and DuelAnswer store the durable record. Runtime room coordination and timers stay in one Node process. A dedicated PostgreSQL session advisory lock prevents a second realtime process from controlling the same database. It is acquired before startup reconciliation, so a failed second startup cannot abort the first process's games. This is a deliberate single-instance design, not high availability.

Reconnections use the existing guest cookie and room ID. They do not reset question deadlines. The default grace period begins when the server detects the last connection for that participant disappearing; physical network-loss detection itself may take longer. If the participant fails to return, the game aborts without a winner.

On a process restart, nonterminal records become ABORTED with SERVER_RESTART. On orderly shutdown, accepted work is settled and unfinished games are aborted with SERVER_STOP. Restart-transparent recovery is not promised. Finished games remain readable by their participants. Losing the database ownership connection stops the service; a persistence conflict/failure marks it unhealthy rather than publishing uncommitted results. Monitor health and restart the process after resolving the fault.

Gameplay cleanup now includes duels older than 30 days and duels involving expired guest sessions. It cascades to players, question snapshots, answers and stored invitation hashes. The web process runs cleanup on first database use and hourly; `npm run data:cleanup` supports independent scheduling. Runtime terminal rooms without connections are evicted after five minutes. Retention of operational logs and backups remains a separate launch requirement.

For production, run the built Next.js application and the built realtime process persistently behind an HTTPS reverse proxy. Keep the same database and WEB_ORIGIN, configure WebSocket upgrade forwarding and adequate polling timeouts, and retain the `/socket.io/` route. The realtime build bundles workspace TypeScript but keeps external dependencies installed. Running a second replica requires a new shared-coordination design; a Socket.IO adapter alone would not distribute the game state or timers.

## Optional analytics

Phase 5 adds first-party analytics, disabled by default. Only consented actions are recorded; room lifecycle counts are deduplicated and aborted games never become completion events. No invitation secret, question content or choice enters telemetry. See [analytics consent, authority and reporting](analytics.md).

## Verification

Use a disposable migrated database, never the development/production content database:

```sh
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/duel_test npm run test:db
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/duel_test npm run test:realtime
npx playwright install chromium
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/duel_test npm run test:e2e
```

The browser suite owns ports 3310 and 3311, starts both services with synthetic demo mode, and closes them afterward. It decodes the rendered QR, uses independent guest contexts, checks shared questions/results and mutual rematch, verifies reload/reconnect and aborted games, and exercises HTTP polling with WebSockets blocked. The realtime suite also covers room fullness, invalid/expired invitations, hidden answer keys, duplicate races, scoring ties, frozen revisions, late answers, failed grace periods, single-process ownership and restart reconciliation. A 20-room concurrent run establishes a local baseline; it is not a hosting capacity guarantee.

Real phone QR scanning, assistive-technology use, production proxy/load behavior, and educational review remain public-launch checks. No public deployment or real advertising was introduced.
