import { analyticsEvent } from "../../../../lib/analytics-server";
import { handle } from "../../../../lib/practice-server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return handle(request, () => analyticsEvent(request), true, "analytics");
}
