# Saobraćajni Duel

A free, mobile-first traffic education app for Serbia, combining practice quizzes, five-question friend duels, and useful public lessons. Advertising may fund the platform later; registration, subscriptions, premium features, and paywalls are outside the product model.

## Project status

Phase 1 foundation: the Next.js interface, realtime service skeleton, content schema, validation/import tooling, and CI checks are implemented. Practice and duels are not playable yet. See [the implementation plan](docs/implementation-plan.md) for delivery phases and acceptance criteria, and [foundation decisions](docs/foundation-decisions.md) for defaults and review gates.

Builds, content/domain checks, PostgreSQL integration checks, and HTTP smoke checks passed. See [verification results and limitations](docs/verification.md). Qualified content review and browser/device accessibility QA remain pending.

The supplied requirements extend an earlier specification that is not present in this repository. The plan explicitly marks assumptions that need confirmation before implementing dependent features.

## Stack

- Next.js, React, TypeScript, and Tailwind CSS for the public website and quiz UI.
- Node.js and Socket.IO for server-authoritative multiplayer.
- PostgreSQL and Prisma for content and persistent game records.
- A persistent Node deployment for realtime connections; avoid infrastructure that only supports short-lived request handlers for the duel server.

Start with one application repository and one database. Do not add Redis, microservices, or an advertiser management system to the MVP.

## Delivery order

1. Foundation and reviewed question content.
2. Anonymous practice quizzes.
3. QR/link-based 1v1 duels and rematches.
4. Public educational pages and SEO.
5. Privacy-conscious analytics.
6. Configurable advertising placeholders.
7. A separate advertising readiness review before enabling a provider.

## Product guardrails

- All learning and gameplay remain free and accessible without an account.
- Educational accuracy, accessibility, performance, and retention take priority over ad impressions.
- Never place ads during active duel questions, near answer controls, or behind a mandatory viewing step. Never force reloads or refresh ads to manufacture impressions.
- Publish original explanations backed by reviewed sources; do not assume exam questions or illustrations can be copied without permission.
- Launch for Serbia with explicit country, language, and script metadata so other jurisdictions can have separate reviewed content later.
- Use placeholders initially. Actual ads require a separate review of current provider policies, privacy obligations, consent behavior, and content readiness.

## Development

Prerequisites: Node.js 24 (see `.nvmrc`), npm, and Docker with Compose for the local PostgreSQL service. An existing PostgreSQL instance also works; set `DATABASE_URL` accordingly.

Run from the repository root:

```sh
npm ci
cp .env.example .env
docker compose up -d --wait
npm run db:generate
npm run db:migrate
npm run content:validate
npm run content:import
npm run dev
```

Open http://localhost:3000. The realtime skeleton provides http://localhost:3001/health and rejects gameplay connections until authorized room handling is implemented. The web UI works without PostgreSQL; imports and future quiz features require the database. Run `npm run dev -w @duel/web` for the website alone.

`DATABASE_URL` is server-only. `WEB_ORIGIN` must exactly match the allowed web origin (no trailing slash). `REALTIME_PORT` defaults to 3001. The root `.env` is loaded by database tools and the realtime service. Never commit a real `.env`. The Compose password is only a local development default; bind the database to loopback and use different secrets in deployment.

## Checks and content

```sh
npm run db:generate
npm run format:check
npm run typecheck
npm test
npm run content:validate
npm run build
```

Use `npm run format` to format source. Generate Prisma before type-checking a clean checkout. Use `npm run db:dev -- --name describe_change` when creating new migrations; `db:migrate` applies committed migrations.

For PostgreSQL integration checks, create a **disposable** database, migrate it, and explicitly set both URLs:

```sh
DATABASE_URL=postgresql://user:password@localhost:5432/duel_test npm run db:migrate
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/duel_test npm run test:db
```

Integration checks append isolated fixtures, including immutable published test revisions. Do not point them at a real content database. CI provisions its own disposable PostgreSQL service.

The sample bank contains five original draft questions and an original illustration. Drafts are imported for editorial work and are never returned by public question queries. See [the content workflow](content/README.md) for source limitations, review requirements, explicit publishing, and immutable revisions. This foundation is not a reviewed exam preparation product.

Production builds use `npm run build`. Start the built web app with `npm run start -w @duel/web` and the realtime skeleton with `npm run start -w @duel/realtime`; keep installed workspaces available. Production hosting, reverse-proxy configuration, and database operations will be completed before public launch.
