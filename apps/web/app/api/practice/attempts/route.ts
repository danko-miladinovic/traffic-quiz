import { analyticsFlag } from "@duel/domain/analytics";
import { startPractice } from "@duel/db/practice";
import {
  body,
  database,
  demoEnabled,
  guestHash,
  handle,
  json,
} from "../../../../lib/practice-server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handle(
    request,
    async () =>
      json(
        await startPractice(database(), await guestHash(), await body(request), {
          allowDemo: demoEnabled(),
          analytics: analyticsFlag(process.env.ANALYTICS_ENABLED),
        }),
      ),
    true,
  );
}
