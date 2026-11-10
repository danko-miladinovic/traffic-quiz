# Content workflow

The sample bank is for Serbia, B category, Serbian Latin. It contains five **draft** questions with original prompts and explanations, plus an original SVG illustration. `PROJECT-ORIGINAL` identifies project-created material; it does not grant a public reuse licence. No third-party exam question bank or illustration has been copied.

The cited [ministry PDF](https://www.mgsi.gov.rs/sites/default/files/zakon_o_bezbednosti_saobracaja_na_putevima.pdf) was consulted on 2026-11-10 and includes amendments through 76/2023. The [official legal information system](https://pravno-informacioni-sistem.rs/viewAct/8b57d1e9-9b34-4fa0-9693-7ceb6da65486) lists a later 19/2025 amendment. A qualified reviewer must check the current consolidated rules, question wording, edge cases, and illustrations before publication. Source access is not expert review. These examples are not a complete exam preparation bank.

## Validate and import

Run these commands from the repository root:

```sh
npm run content:validate
npm run content:import
```

Validation checks required source and rights metadata, country/locale boundaries, references to categories, unique option keys, correct-answer membership, review evidence, and referenced image existence. Imports run in a serializable transaction and are idempotent. DRAFT and REVIEWED records are stored but excluded from public queries.

## Review and publish

1. Author or edit a DRAFT revision in the JSON source file. Keep one correct answer for this initial question format.
2. Have a qualified reviewer check it against current official sources. Record their actual identity and review date; never insert a fictional approval.
3. Change `review.status` to `REVIEWED`, add `reviewer` and `reviewedOn`, and import the file.
4. After editorial approval, change the status to `PUBLISHED` and explicitly run:

```sh
npm run content:import -- content/rs-b.sr-Latn.json --publish
```

The flag acknowledges the publication action; it cannot verify a person's qualifications. Publication remains an editorial responsibility. This command is local tooling, not an exposed admin endpoint.

Published revisions and their answer options are protected from changes/deletion by database triggers and import checks. To correct published material, increment `revision`, set the new revision to DRAFT, review, then publish it. Public selection chooses the newest published revision of each question. If urgent withdrawal is needed, design a separate audited availability mechanism before public launch; do not edit historical answers or disable database protections.

New content banks require deliberate schema changes to the current RS/B/Serbian-Latin validator; the database already separates jurisdictions and locales. Adding a country requires its own sources and review, not just translation.
