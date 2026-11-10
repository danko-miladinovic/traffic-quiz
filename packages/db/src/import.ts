import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentBankSchema } from "@duel/domain";
import { createDatabase } from "./client";
import { importContent } from "./content";

const args = process.argv.slice(2);
const allowed = new Set(["--validate", "--publish"]);
if (
  args.some((arg) => arg.startsWith("--") && !allowed.has(arg)) ||
  args.filter((arg) => !arg.startsWith("--")).length > 1
) {
  throw new Error("Usage: content:import [content.json] [--publish] [--validate]");
}
const path = args.find((arg) => !arg.startsWith("--")) ?? "content/rs-b.sr-Latn.json";
const bank = contentBankSchema.parse(JSON.parse(await readFile(resolve(path), "utf8")));
for (const question of bank.questions) {
  if (question.image) await readFile(resolve("apps/web/public", `.${question.image.path}`));
}
if (args.includes("--validate")) {
  console.log(
    `Validated ${bank.questions.length} questions (${bank.locale}, ${bank.licenceCategory}).`,
  );
} else {
  const db = createDatabase();
  try {
    await importContent(db, bank, args.includes("--publish"));
    console.log(
      `Imported ${bank.questions.length} questions. Only PUBLISHED revisions are public.`,
    );
  } finally {
    await db.$disconnect();
  }
}
