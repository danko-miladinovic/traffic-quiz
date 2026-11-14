import { getPractice } from "@duel/db/practice";
import {
  attemptId,
  database,
  demoEnabled,
  guestHash,
  handle,
  json,
} from "../../../../../lib/practice-server";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(request, async () =>
    json(
      await getPractice(database(), await guestHash(), await attemptId(context), {
        allowDemo: demoEnabled(),
      }),
    ),
  );
}
