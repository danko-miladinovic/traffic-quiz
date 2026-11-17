# Educational pages and SEO (phase 4)

## Local walkthrough

Run the normal development command and open `/ucenje`. This learning hub, its five category pages, and published lesson pages are server-rendered and need neither PostgreSQL nor browser JavaScript. Gameplay still needs PostgreSQL and the realtime service as documented separately.

The five supplied lessons are **DRAFT**. They introduce study methods for signs, right of way, reading intersections, exam preparation and learning from mistakes. They are starting material for editorial expansion, not reviewed traffic-rule lessons or a complete exam course. No reviewer identity or date is supplied. Public categories honestly show that review is pending; draft lesson URLs return 404 and never receive public navigation links. Source files are not public assets.

## Content architecture and publication

`content/lessons/rs-b.sr-Latn.json` is the editorial source, validated by `packages/domain/src/education.ts`. It scopes the bank to Serbia, B category and Serbian Latin. Categories contain their own descriptions; lessons record a revision, stable localized slug, summary, sections, optional checklists, related lesson slugs, sources/access dates, original rights, last edit and review evidence.

File-based content keeps this small corpus reviewable in Git, avoids database access during public rendering, and does not require a CMS or migration. Publishing, corrections and withdrawals require a source change and rebuild/redeploy. This is distinct from immutable question revisions in PostgreSQL; it does not alter gameplay content or recorded answers. Git retains editorial history; there is no browser editorial/admin endpoint.

```sh
npm run lessons:validate
# Existing content validation also checks lessons:
npm run content:validate
npm run test:education
```

To publish a lesson:

1. Expand the draft into a useful original explanation, with concrete examples and appropriate illustrations if needed. Verify every factual claim against current official Serbian sources and record precise references and usage rights. The currently cited [road authority PDF](https://www.putevi-srbije.rs/images/pdf/regulativa/Zakon-o-bezbednosti-saobracaja-na-putevima-19-25.pdf) includes amendments through 19/2025; access to it is not a conclusion that no newer rules exist, nor a substitute for expert review.
2. Obtain qualified review. Record the actual reviewer and review date. Set `REVIEWED` while awaiting editorial release; these records remain private.
3. For an approved release, set `PUBLISHED`, commit/review the source change, then rebuild and deploy. Both reviewer and review date are required, and the review date cannot precede `updatedOn`. Validation cannot establish a person's qualifications or the truth of their approval.
4. For corrections, increment `revision`, update `updatedOn`, return the text to DRAFT and repeat review. This withdraws the public lesson until approved again. Urgent withdrawal can likewise remove it from the published projection and rebuild; purge any hosting cache as part of deployment.

`content:import` imports quiz questions only. It does not publish lessons. No environment switch bypasses lesson review. Only the PUBLISHED projection is passed to lesson routes, related links, static params and sitemaps. Unknown or unpublished lesson slugs are 404s. Related references may point to drafts in the editorial source; those links appear publicly only once their target is published.

New lessons use plain text paragraphs and checklists rendered as React text, rather than executable MDX/raw HTML. Schema validation rejects unknown categories, broken related references, duplicate slugs/section IDs, unsafe source URL schemes, missing review evidence and stale review dates. New jurisdictions/scripts require an explicit schema/editorial change, not copying another country's rules.

## Public routes and metadata

- `/ucenje`: learning hub.
- `/ucenje/oblasti/:slug`: category overview and its published lessons.
- `/ucenje/lekcije/:slug`: published lesson, table of contents, sources, review details, related lessons and practice link. Categories mapped to an existing quiz category link directly to its native practice-card anchor; other categories use the practice selector.
- `/sitemap.xml`: eligible public URLs only.
- `/opengraph-image`: locally rendered 1200×630 PNG brand preview.

Pages have unique Serbian titles/descriptions and semantic headings. Metadata includes a configured canonical URL, Open Graph and Twitter preview. Lesson pages add Article and BreadcrumbList JSON-LD matching visible text and navigation; no invented author, rating, certification, publication date or search-result guarantee is included. JSON-LD escapes `<` and prose is escaped by React.

The layout's default remains noindex. `/duel`, `/vezbanje`, private APIs and unknown routes remain noindex and never enter the sitemap. Invitations remain URL fragments. A canonical URL identifies a public page; it never includes invitation fragments, result IDs or request query strings. These controls do not replace cookie-based authorization.

## Indexing and deployment

Settings are read at build time; configure them before building and keep them consistent when starting the web process:

```sh
SITE_URL=https://your-public-domain.rs
SEARCH_INDEXING_ENABLED=false
```

SITE_URL is the canonical origin only: no path, query, fragment or credentials. It is separate from WEB_ORIGIN, which protects gameplay writes. Without SITE_URL, no canonical links are emitted; development social-image URLs use the layout's localhost base. Set the intended origin before previewing social cards publicly.

Keep indexing false for local/staging deployments and until content and operational launch gates pass. A future public release can set SEARCH_INDEXING_ENABLED=true with its real HTTPS SITE_URL. Invalid values fail the build. Enabling the flag alone cannot publish drafts: without any published lessons the sitemap stays empty and robots disallows crawling. Empty categories remain noindex and outside the sitemap even after other categories become available.

When indexing is enabled and published lessons exist, robots allows crawling public pages and advertises the sitemap; it disallows APIs and Socket.IO. Gameplay HTML remains crawlable so search engines can see its noindex directive. Previously indexed URLs may take time to disappear. No robots or metadata directive is an access-control guarantee.

Socket.IO's slash-preserving rewrite and disabled automatic slash redirect are unchanged. Educational canonicals consistently omit trailing slashes; slash variants are not redirected globally, preserving both socket transports. Configure any host redirect with an explicit Socket.IO exception.

## Accessibility and performance

The hub and lesson body require no client bundle for their content. Navigation and in-page contents use native links; the shared skip link targets the main landmark. Narrow layouts stack cards, the contents list and practice CTA, with visible keyboard focus and readable line lengths. Header navigation styles are scoped to the header so they cannot hide lesson links on mobile.

There are no remote font requests or new third-party scripts. Existing system fonts avoid font downloads/layout changes. The brand social image has explicit dimensions and is generated locally; draft lessons introduce no instructional illustrations requiring placeholder layout. Any future instructional image must have reviewed rights/alt text and explicit dimensions. Mobile browser checks are emulation, not physical-device or assistive-technology certification.

Run `npm run test:education` for publication/SEO/initial-HTML checks and the documented disposable-database `npm run test:e2e` flow for desktop/mobile navigation and gameplay regressions. See [verification history](verification.md) for observed checks and outstanding launch gates. No analytics, advertising, hosting or public deployment is added here.
