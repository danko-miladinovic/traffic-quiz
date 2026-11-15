import { listPracticeCategories } from "@duel/db/practice";
import { database, demoEnabled, handle, json } from "../../../../lib/practice-server";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return handle(request, async () =>
    json({ categories: await listPracticeCategories(database(), demoEnabled()) }),
  );
}
