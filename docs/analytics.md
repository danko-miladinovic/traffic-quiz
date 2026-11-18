# First-party analytics (phase 5)

## Choice and activation

The application uses its existing PostgreSQL database, with no external analytics provider, third-party tracking script, IP-based visitor hash, fingerprint, or public reporting endpoint. Reports are a local operator CLI. This avoids another service, account and data processor, but analytics writes share database capacity with gameplay and need operational monitoring.

Collection is **disabled by default**. Keep `ANALYTICS_ENABLED=false` in both services until the controller, hosting/log behavior, privacy information and applicable consent requirements have been reviewed for the actual deployment. This implementation makes no legal-compliance determination. Consent behavior is implemented conservatively; deployment-specific requirements still need review. To preview locally:

```sh
npm run db:generate
npm run db:migrate
ANALYTICS_ENABLED=true PRACTICE_DEMO=true npm run dev
```

The setting is server-only. Set it consistently for web and realtime and before production builds: the static layout includes preference controls only when enabled. Invalid flag values fail validation. With the flag off there is no preference UI, analytics request or analytics identity creation from ordinary browsing. Previous data still follows retention cleanup; disabling collection does not extend retention or erase existing consent records.

When enabled, a small nonmodal section at the foot of each page offers equally styled Allow/Without analytics controls. Nothing blocks reading, quiz controls or joining a duel. No analytics identity/event is created until explicit opt-in. Refusal stores only a nonunique functional choice cookie so the question need not be repeated. Preferences remain editable through the native disclosure. Read-only preference requests are not page-view events.

An opt-in creates a separate random 256-bit HttpOnly, SameSite=Lax cookie (`duel_analytics`), Secure in production. Only its SHA-256 hash is stored; browser scripts never receive its value or database ID. Consent lasts 35 days without automatic renewal. The nonunique choice cookie also lasts 35 days. Functional gameplay credentials remain separate and retain their original purpose. A consenting browser's gameplay session is linked to the analytics identity on session establishment or preference change; realtime rechecks that database link for each accepted event.

Choosing Without analytics stops browser sends immediately, revokes the identity, clears the identity cookie and deletes associated raw events/visits. The guest link becomes null. Gameplay records are unaffected. Previously created count-only aggregates may remain. Other tabs receive a nonidentifying localStorage change notification and refresh preferences; no analytics/offline queue is stored in localStorage. Clearing cookies resets browser recognition and can increase apparent unique users. Deleted cookies cannot themselves notify an already-open server connection; use the withdrawal control, which updates the server link, for immediate withdrawal.

`Sec-GPC: 1` and `DNT: 1` requests prevent opt-in and revoke an existing analytics identity on the next preference check. Treating these as analytics opt-outs is a conservative product choice, not a claim about their legal scope. GPC is not available in every browser; absence of a signal never substitutes for explicit consent. See [GPC API reference](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/globalPrivacyControl).

## Events and privacy boundary

Accepted gameplay and its analytics event are committed in one serializable database transaction. There is no best-effort external delivery gap and no second client completion event. A database analytics-table failure can therefore fail an opted-in gameplay transaction; apply migrations to both processes before activation and monitor database health. When disabled or not consented, gameplay analytics helpers return without analytics queries.

| Event              | Authority and replay key                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| page_view          | Browser-observed, fixed validated public pathname, per-navigation UUID; repeated same request counts once                    |
| practice_started   | Newly created server attempt; attempt-derived key                                                                            |
| question_answered  | Newly accepted practice or duel submission; question/seat-derived key, no choice/correctness/text                            |
| practice_completed | First server completion of an attempt                                                                                        |
| duel_created       | Newly created server room, including rematches                                                                               |
| invite_action      | Explicit completed clipboard/share action by the room creator in a live lobby; one action UUID                               |
| challenge_shared   | Same observed copy/share invocation, separate named counter; not proof of delivery                                           |
| player_joined      | First accepted invitation join by the second guest; automatic rematch seats do not count as invitation joins                 |
| duel_started       | First server start; one room event if at least one participant currently consents                                            |
| duel_completed     | First FINISHED transition; one room event if at least one participant currently consents; aborted/expired rooms do not count |
| rematch_requested  | First explicit consented request per participant/finished room                                                               |

Room lifecycle events choose the first currently consenting participant, in seat order, for attribution and use one global room/event replay key. Other participant activity is included only when that participant consents. Thus a consenting guest can make a completed duel observable even if the creator did not consent; counts reflect observed events, not the full platform funnel. A change/withdrawal in consent can make funnel coverage vary between stages. Exact participant totals cannot be inferred from these metrics.

Raw rows contain an internal visitor ID, visit ID, fixed event name/mode, server time, a demo flag, optional known public pathname and an opaque SHA-256 resource key for deduplication/cohort matching. They have **no** general JSON payload, answer choice/text/correctness, score, invitation token/hash, guest token/hash, nickname, IP, user agent, referrer string, UTM string or full URL field. Event keys are hashed and never printed by the report CLI. Public pathname validation only accepts the known hub/category/published-lesson and app routes; query strings, fragments, unknown paths and extra event properties are rejected.

The browser parses referrer/campaign information locally and sends only `direct`, `organic`, `social`, `referral` or `unknown`. Raw strings never cross the analytics endpoint. Search referrers use a small explicit hostname list; campaign identifiers are not evidence of organic search and are grouped as unknown unless they match the fixed social source list. Unknown/stripped referrers reduce attribution accuracy. This is a client-reported channel estimate, not authoritative acquisition attribution. [Referrer behavior depends on browser policy](https://developer.mozilla.org/en-US/docs/Web/API/Document/referrer).

Every write uses the existing same-origin checks, bounded 2 KiB JSON body, private/no-store/noindex responses and bounded process request limiter. The database also caps analytics events to 240 per visitor per minute; excess events are dropped rather than blocking accepted gameplay. Browser requests retry once with the same event ID, without an unbounded persistent queue. Browsers cannot submit server outcome names or arbitrary metadata. Invitation events independently authorize the live room creator; a submitted room ID is used for authorization and hashed before storage, never treated as a credential. These controls reduce abuse; they do not make client page-view/share reports tamper-proof or bot-free.

Application analytics storage excludes IPs and full URLs, but hosting/proxy access logs remain an independent configuration concern. Keep fragment-based invitation URLs, redacted logs and existing guest authorization in place.

## Reports and metric definitions

```sh
# Current UTC calendar month to tomorrow, excluding synthetic gameplay:
npm run analytics:report
# Start inclusive, end exclusive; raw window at most 32 days:
npm run analytics:report -- 2026-11-01 2026-12-01
# Explicit local demo/testing report:
npm run analytics:report -- 2026-11-01 2026-12-01 --include-demo
# Saved daily/monthly counts for historical periods:
npm run analytics:report -- 2026-01-01 2027-01-01 --history
```

Reports require operator database access and are not exposed as a public dashboard. They print counts and coverage notes only. Raw date ranges outside retained history are rejected; use saved history instead. Each raw report is capped at 100,000 events and fails explicitly above that limit. Move aggregation into database queries after measured volume justifies it; do not silently sample or add infrastructure now.

- **Visit:** events for one consenting identity, separated by at least 30 minutes of inactivity. Creation is serialized across tabs. A visit is not a quiz attempt; one visit may contain multiple games. Counts are distinct visits with an accepted event in the requested window, so a visit crossing midnight can appear in both daily reports but once in the monthly report.
- **Daily/monthly active users:** distinct consenting browser identities with any accepted event in the UTC day/calendar month. Monthly uniques are computed from that month's events, never by adding daily uniques.
- **Returning visitors:** identities with an event in a visit that follows an earlier visit within retained recognition history. Additional events in one visit are not a return. Cookie/consent resets and devices cannot be joined.
- **Average answers per visit:** accepted question_answered events divided by observed distinct visits; includes practice and duel submissions, no answer content.
- **Practice completion rate:** distinct attempts with both start and completion in the report window divided by distinct attempts started in that window. Starts near the end and completions crossing windows lower this window-bound rate; it is not an eventual lifetime completion probability.
- **Created/completed duels and successful joins:** corresponding server-observed event counts, subject to consent coverage at each transition.
- **Invitation rate:** distinct observed duel creators who also invoke a copy/share action in the window divided by distinct observed duel creators in the window. Repeated actions by one creator do not increase this rate. A successful invitation join is a separate event and does not establish a real-world friendship.
- **Traffic channels:** distinct observed visits by their first event's channel. Server-first visits have unknown source; later page views do not overwrite it.

All unique/returning metrics are estimates covering consenting browsers only. Refusal, browser signals, script blocking, cookies and consent expiry reduce coverage; there is no fingerprinting or reconstruction of missing identities. Demo gameplay is excluded from normal reports and saved aggregates. Locally enabled analytics still records ordinary page views, so do not enable it in development against a production database.

## Retention and operations

- Raw events and visits: a **35-day cutoff**, removed on the next hourly/daily cleanup, allowing daily cleanup to finalize a 31-day calendar month before its earliest events expire. This resolves the earlier retention assumption specifically for analytics; gameplay stays at 30 days.
- Visitor credential/link: consent expires after 35 days; expired identities cannot generate events. Records are removed after 35 days without accepted activity so still-retained events remain available for monthly aggregation. Revocation deletes the identity and raw linked data immediately.
- Count-only daily/monthly aggregates: current UTC month and the preceding 12 calendar months, with no visitor IDs, resource keys or tokens. Current periods are provisional; history has `updatedAt` to show the last successful refresh.

The existing hourly web cleanup and `npm run data:cleanup` refresh daily/monthly aggregates before raw deletion. Schedule the command **at least daily**, including while collection is disabled if previous data exists. Observe completion and failures. A downtime exceeding the 35-day raw window can leave historical gaps; no report reconstructs missing months. Do not sum daily uniques or visit counts to manufacture monthly totals.

This initial aggregator rewrites retained complete daily periods and the current/previous month when its full raw window remains available. It skips already-truncated older periods, preserving their saved counts. Revocation can reduce still-provisional periods when they are refreshed. Aggregate writes and retention deletions are retryable/idempotent; interrupted cleanup can be rerun. No host scheduler, backup expiry, production load test or operational legal review is provisioned by this code.

## Verification

Use the documented disposable TEST_DATABASE_URL for database/realtime/browser checks. Run these harnesses sequentially; the database script also serializes test files because retention fixtures deliberately advance time and delete expired records. The controlled database test verifies repeated page/answer requests, visit inactivity, return estimates, scoring events, two-participant duel deduplication, invitation authorization, revocation, retention and report totals. Browser tests cover opt-in/refusal, cookie privacy, secret exclusion, completion authority, cross-origin rejection, withdrawal and privacy signals on desktop/mobile. Disabled production behavior must be checked on a build with ANALYTICS_ENABLED=false. See [verification history](verification.md) for actual results and remaining launch gates.
