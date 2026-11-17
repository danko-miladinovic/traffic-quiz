import { readFileSync } from "node:fs";
import { educationBankSchema, publishedLessons } from "@duel/domain/education";
const bank = educationBankSchema.parse(
  JSON.parse(
    readFileSync(new URL("../content/lessons/rs-b.sr-Latn.json", import.meta.url), "utf8"),
  ),
);
console.log(
  `Validated ${bank.lessons.length} lessons; ${publishedLessons(bank).length} published. Review evidence is an editorial responsibility.`,
);
