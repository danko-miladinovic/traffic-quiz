# Advertising placeholders (phase 6)

## Preview locally

No real advertising is implemented or enabled. The only renderer is an inert local placeholder. The placeholders make no network requests and add no advertising scripts, provider credentials, impression events, sponsor links or cookies.

The default is `ADS_PREVIEW=false`. To inspect layouts with the existing development database and technical-probe questions:

```sh
ADS_PREVIEW=true PRACTICE_DEMO=true npm run dev
```

Open `/` and `/ucenje/oblasti/saobracajni-znakovi` for public-page previews. Complete a practice attempt or a two-browser duel to see its result placement. Practice questions, explanations, duel selection/lobbies/questions/reveals, and interrupted/expired games have no slot. Start another attempt or mutually accept a rematch to confirm the result placeholder disappears. See [practice](practice.md) and [duel setup](duels.md) for database and invitation details.

For homepage/category work alone, `ADS_PREVIEW=true npm run dev -w @duel/web` does not require database access to render those pages. Gameplay still needs the existing migrations and PostgreSQL; duels need both processes. Phase 6 adds no dependency, migration or external account. Keep your existing `.env`; adding the preview flag there is optional and requires restarting the web process.

The setting is server-only and accepts exactly `true` or `false`. It enables a placeholder only when NODE_ENV is `development`; test/production configuration resolves to the disabled provider. Server pages pass the small provider configuration to gameplay components. A second guard in `AdSlot` returns null in production even if a caller supplies the placeholder configuration. Building or starting production with ADS_PREVIEW=true therefore cannot activate placeholders or a real ad provider. Do not change NODE_ENV to bypass this boundary.

## Placement and provider boundary

`apps/web/lib/ad-policy.ts` defines the allowlist and context checks; `components/ad-slot.tsx` owns the provider interface and accessible wrapper. Provider configuration currently supports only `none` and `placeholder`. A renderer receives only a fixed placement ID, not gameplay objects, guest/analytics identifiers, invitation strings, answers or arbitrary URLs. There is no dynamic script loader or remotely supplied provider selection.

| Placement ID           | Location                                                                     | Required state                  | Reserved minimum height            |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------- | ---------------------------------- |
| home-after-topics      | Homepage, between topic cards and duel introduction                          | Public homepage                 | 176 px desktop / 200 px at ≤700 px |
| category-after-lessons | After category lesson list or review-pending notice, before practice section | Public category                 | 176 / 200 px                       |
| lesson-after-content   | After the full article, including sources/review, before practice section    | Published lesson                | 280 px                             |
| practice-after-results | Below result/review workspace and return controls                            | Completed practice, result view | 176 / 200 px                       |
| duel-after-results     | Below final result/review workspace and rematch/navigation controls          | FINISHED duel with result       | 176 / 200 px                       |

The learning hub, about page and unknown/unpublished lesson URLs have no placement. Lesson drafts remain private: there is no preview route or publication exception for advertising. Article-render tests use explicitly synthetic review evidence in memory only.

Gameplay callers mount slots only for their completed result views. The component independently rejects mismatched surfaces, nonresult practice states, and every duel state except FINISHED. Result actions keep their existing behavior and never require an ad interaction. An abort, expiry, reconnection, next question or reveal cannot create an advertising slot.

Slots are not mounted in the global layout, so navigation to `/duel` cannot inherit a public-page banner. They are also outside answer forms, quiz workspaces and answer/review controls. At least 48 CSS pixels of outer margin separate a slot from neighboring sections/controls. Placements are not sticky overlays, interstitials, gates or click targets. Changing these rules requires deliberate policy/UI changes and corresponding checks.

## Layout and accessibility

The preview uses the existing palette and system fonts, with a visible `Oglas · razvojni pregled` label and `Oglasi nisu aktivni.` text. The aside has a descriptive accessible name and no focusable content. It does not resemble an answer button, link, navigation card or real sponsor creative.

CSS reserves minimum height in the initial HTML/CSS. The placeholder has no loading transition, asynchronous creative, timer or refresh, and adds no remote font/image dependency. Desktop/mobile checks compare its position and height without JavaScript to the hydrated page. Minimum heights can expand to accommodate text/browser font settings; resizing the viewport may naturally change the responsive layout. This is not a guarantee about a future external provider's layout behavior.

Disabled `AdSlot` returns null before creating its wrapper. There is no empty container, reserved height, label or margin left by a disabled slot. Real providers would need their own sizing, accessibility, error/loading and privacy review; the current interface cannot establish those properties for code that does not exist yet.

## Verification and release boundaries

```sh
npm run db:generate
npm run test:ads
npm run test:education
npm run typecheck
npm run build
```

Use the documented disposable TEST_DATABASE_URL for `npm run test:e2e`. Browser tests explicitly enable the development preview, cover desktop/mobile reserved space and same-origin-only requests, exercise practice completion/retry, and check duel questions/reveals/results/rematch/abort. Run database, realtime and browser harnesses sequentially against one test database. Unit checks cover all denied gameplay contexts, disabled/production output, provider markup, and article placement after sources. CI includes `test:ads`.

Production checks should build with ADS_PREVIEW=true and still find no ad wrapper or empty ad gap. Neither this feature flag nor analytics consent is an approval to enable an ad network. Analytics remains separately disabled by default, and this phase adds no ad events to its schema.

Phase 7 remains a separate launch and advertising readiness milestone: qualified content review, hosting/proxy/backup/monitoring operations, privacy/controller information, real-device/assistive-technology QA, and current provider/consent requirements must be addressed before a deliberate advertising release. No eligibility, revenue, impression or ranking claim is made here. Advertiser accounts, campaign management, billing, subscriptions and paywalls remain outside scope.
