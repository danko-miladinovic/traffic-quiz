import { analyticsFlag } from "@duel/domain/analytics";
import { answerPractice } from "@duel/db/practice";
import {
  attemptId,
  body,
  database,
  demoEnabled,
  guestHash,
  handle,
  json,
} from "../../../../../../lib/practice-server";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(
    request,
    async () =>
      json(
        await answerPractice(
          database(),
          await guestHash(),
          await attemptId(context),
          await body(request),
          { allowDemo: demoEnabled(), analytics: analyticsFlag(process.env.ANALYTICS_ENABLED) },
        ),
      ),
    true,
  );
}
