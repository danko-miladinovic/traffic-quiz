import { establishSession, handle } from "../../../../lib/practice-server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handle(request, establishSession, true, "session");
}
