import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { analyticsFlag, browserEventSchema, preferenceSchema } from "@duel/domain/analytics";
import {
  analyticsHash,
  ANALYTICS_DAYS,
  bindAnalytics,
  browserAnalytics,
  consentVisitor,
  invitationAnalytics,
  revokeVisitor,
} from "@duel/db/analytics";
import { PracticeError } from "@duel/domain/practice";
import { categories, lessons } from "./education";
import { body, database, json } from "./practice-server";
const identityCookie = "duel_analytics";
const choiceCookie = "duel_analytics_choice";
const valid = (value: string | undefined): value is string =>
  !!value && /^[a-f0-9]{64}$/.test(value);
const protectedPreference = (request: Request) =>
  request.headers.get("sec-gpc") === "1" || request.headers.get("dnt") === "1";
export const analyticsEnabled = () => analyticsFlag(process.env.ANALYTICS_ENABLED);
const options = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: ANALYTICS_DAYS * 86400,
});
async function rawIdentity() {
  return (await cookies()).get(identityCookie)?.value;
}
export async function linkGuestAnalytics(guestHash: string) {
  if (!analyticsEnabled()) return;
  const token = await rawIdentity();
  await bindAnalytics(database(), guestHash, valid(token) ? analyticsHash(token) : undefined);
}
async function clearIdentity() {
  const token = await rawIdentity();
  if (valid(token)) await revokeVisitor(database(), analyticsHash(token));
}
export async function analyticsPreference(request: Request, write = false) {
  if (!analyticsEnabled()) return json({ enabled: false, consent: false });
  const jar = await cookies();
  const blocked = protectedPreference(request);
  if (write) {
    const parsed = preferenceSchema.safeParse(await body(request));
    if (!parsed.success)
      throw new PracticeError("INVALID_INPUT", "Izaberi postavku analitike.", 400);
    const allow = parsed.data.consent && !blocked;
    const currentToken = await rawIdentity();
    const current = valid(currentToken)
      ? await database().analyticsVisitor.findUnique({
          where: { tokenHash: analyticsHash(currentToken) },
        })
      : null;
    if (allow && current && current.consentUntil > new Date() && current.expiresAt > new Date())
      return json({ enabled: true, consent: true, decided: true, blocked: false });
    await clearIdentity();
    const response = json({ enabled: true, consent: allow, decided: true, blocked });
    response.cookies.set(choiceCookie, allow ? "on" : "off", options());
    if (allow) {
      const token = randomBytes(32).toString("hex");
      const visitor = await consentVisitor(database(), analyticsHash(token));
      const guest = jar.get("duel_guest")?.value;
      if (valid(guest)) await bindAnalytics(database(), analyticsHash(guest), visitor.tokenHash);
      response.cookies.set(identityCookie, token, options());
    } else response.cookies.set(identityCookie, "", { ...options(), maxAge: 0 });
    return response;
  }
  if (blocked) {
    await clearIdentity();
    const response = json({ enabled: true, consent: false, decided: true, blocked: true });
    response.cookies.set(identityCookie, "", { ...options(), maxAge: 0 });
    return response;
  }
  const token = jar.get(identityCookie)?.value;
  const visitor = valid(token)
    ? await database().analyticsVisitor.findUnique({ where: { tokenHash: analyticsHash(token) } })
    : null;
  const consent = !!visitor && visitor.consentUntil > new Date() && visitor.expiresAt > new Date();
  const guest = jar.get("duel_guest")?.value;
  if (valid(guest))
    await bindAnalytics(database(), analyticsHash(guest), consent ? visitor!.tokenHash : undefined);
  return json({
    enabled: true,
    consent,
    decided: consent || jar.get(choiceCookie)?.value === "off",
    blocked: false,
  });
}
const allowedPage = (page: string) =>
  ["/", "/ucenje", "/vezbanje", "/duel", "/o-projektu"].includes(page) ||
  categories.some((category) => page === `/ucenje/oblasti/${category.slug}`) ||
  lessons.some((lesson) => page === `/ucenje/lekcije/${lesson.slug}`);
export async function analyticsEvent(request: Request) {
  if (!analyticsEnabled() || protectedPreference(request)) return json({ ok: true });
  const parsed = browserEventSchema.safeParse(await body(request));
  if (!parsed.success)
    throw new PracticeError("INVALID_INPUT", "Podaci analitike nisu ispravni.", 400);
  const token = await rawIdentity();
  if (!valid(token)) return json({ ok: true });
  const event = parsed.data;
  if (event.name === "page_view") {
    if (!allowedPage(event.page))
      throw new PracticeError("INVALID_INPUT", "Stranica nije dostupna.", 400);
    await browserAnalytics(database(), analyticsHash(token), {
      name: event.name,
      key: event.requestId,
      page: event.page,
      source: event.source,
    });
  } else {
    const guest = (await cookies()).get("duel_guest")?.value;
    if (!valid(guest)) throw new PracticeError("NOT_FOUND", "Poziv nije dostupan.", 404);
    await invitationAnalytics(
      database(),
      analyticsHash(token),
      analyticsHash(guest),
      event.roomId,
      event.requestId,
    );
  }
  return json({ ok: true });
}
