# Project guidance

Read README.md, docs/implementation-plan.md, and docs/foundation-decisions.md before changing the application. Phase 1 scaffolding exists; practice and multiplayer gameplay remain unimplemented.

## Product constraints

- Keep practice and multiplayer completely free and usable without registration.
- Preserve the requested stack: Next.js, React, TypeScript, Tailwind CSS, Node.js, Socket.IO, PostgreSQL, and Prisma.
- Implement practice before multiplayer, then educational pages, analytics, and advertising placeholders.
- Do not activate real advertising as part of the MVP. Do not build advertiser management, subscriptions, premium accounts, or paywalls.
- Keep active multiplayer questions free of advertising. Separate any other advertising placement from quiz controls and label it clearly.
- Prioritize mobile usability, accessibility, original educational content, and minimal data collection.

## Engineering constraints

- Explain major architectural changes and their trade-offs before implementing them.
- Keep correct answers, scoring, question progression, and duel outcomes authoritative on the server. Never trust client-reported scores or timestamps.
- Validate HTTP and socket inputs, authorize every room action, rate-limit abuse, and avoid exposing guest credentials in invitation links or logs.
- Keep Serbian content scoped by country, locale, and script. Do not reuse another country's traffic rules without independent review.
- Record sources, review status, and usage rights for questions, explanations, and illustrations. Only publish reviewed content.
- Keep analytics pseudonymous and bounded by retention rules; exclude invitation secrets, free-text nicknames, and raw answer content from analytics payloads.
- Use the simplest deployment that supports persistent Socket.IO connections. Add distributed infrastructure only when measured needs justify it.

## Verification and documentation

- Add meaningful checks for scoring, answer validation, room authorization, reconnection, and multiplayer lifecycle behavior when those features exist.
- Check core flows on mobile and keyboard navigation; verify server-rendered educational content and metadata.
- Document actual setup commands, environment variables, migrations, and deployment steps as they become available. Never commit credentials.
- Update the implementation plan when assumptions are resolved or scope changes.
- Use Node 24 and npm workspaces. Run `npm run db:generate` before type checks on a fresh checkout. Keep package-lock.json synchronized and use `npm ci` in CI.
- Run database integration checks only with an explicit TEST_DATABASE_URL pointing to disposable PostgreSQL. Tests intentionally retain immutable published fixtures.
- Keep supplied draft content unpublished until a qualified reviewer has checked current official sources. Never fabricate reviewer identities or dates. See content/README.md.
