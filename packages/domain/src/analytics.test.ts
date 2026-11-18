import assert from "node:assert/strict";
import test from "node:test";
import { analyticsFlag, browserEventSchema, trafficSource } from "./analytics";
test("browser analytics excludes outcomes, secrets, arbitrary fields and URL query/fragment data", () => {
  const requestId = "fb552769-511c-4da0-a0ca-736daee4fd2d";
  assert.equal(
    browserEventSchema.safeParse({ name: "page_view", requestId, page: "/duel", source: "direct" })
      .success,
    true,
  );
  for (const change of [
    { page: "/duel#poziv=secret" },
    { page: "/duel?secret=x" },
    { token: "secret" },
    { referrer: "https://example.org/private" },
    { name: "duel_completed" },
    { score: 5 },
  ])
    assert.equal(
      browserEventSchema.safeParse({
        name: "page_view",
        requestId,
        page: "/duel",
        source: "direct",
        ...change,
      }).success,
      false,
    );
  assert.equal(analyticsFlag(undefined), false);
  assert.throws(() => analyticsFlag("1"));
});
test("traffic attribution produces only bounded channels and does not mistake paid campaigns for organic", () => {
  const origin = "https://quiz.rs";
  assert.equal(trafficSource("", origin), "direct");
  assert.equal(trafficSource("https://www.google.rs/search?q=SECRET#secret", origin), "organic");
  assert.equal(trafficSource("https://www.google.rs/", origin, "google"), "unknown");
  assert.equal(trafficSource("https://google.evil.com/private", origin), "referral");
  assert.equal(trafficSource("https://m.facebook.com/private?token=secret", origin), "social");
  assert.equal(trafficSource(origin + "/duel#secret", origin), "direct");
  assert.equal(trafficSource("javascript:secret", origin), "unknown");
});
