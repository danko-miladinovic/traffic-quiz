import { analyticsPreference } from "../../../../lib/analytics-server";
import { handle } from "../../../../lib/practice-server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handle(request, () => analyticsPreference(request), false, "analytics");
}
export async function POST(request: Request) {
  return handle(request, () => analyticsPreference(request, true), true, "analytics");
}
