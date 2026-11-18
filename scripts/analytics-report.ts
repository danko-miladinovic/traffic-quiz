import { config } from "dotenv";
import { createDatabase } from "@duel/db";
import { analyticsReport, ANALYTICS_DAYS } from "@duel/db/analytics";
config({ quiet: true });
const args = process.argv.slice(2);
if (
  args.some(
    (arg) => !["--history", "--include-demo"].includes(arg) && !/^\d{4}-\d{2}-\d{2}$/.test(arg),
  )
)
  throw new Error(
    "Usage: analytics:report [from YYYY-MM-DD] [to YYYY-MM-DD, exclusive] [--history] [--include-demo]",
  );
const dates = args.filter((arg) => !arg.startsWith("--"));
if (dates.length > 2) throw new Error("At most two dates");
const now = new Date();
const from = dates[0]
  ? new Date(dates[0])
  : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const to = dates[1]
  ? new Date(dates[1])
  : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
if (
  dates.some(
    (value) =>
      !Number.isFinite(+new Date(value)) || new Date(value).toISOString().slice(0, 10) !== value,
  )
)
  throw new Error("Invalid calendar date");
if (args.includes("--history") && args.includes("--include-demo"))
  throw new Error("Saved history excludes demo gameplay; use a raw report for demo checks");
if (!Number.isFinite(+from) || !Number.isFinite(+to) || from >= to)
  throw new Error("Invalid report dates");
const db = createDatabase();
try {
  const coverage =
    "Consenting browser estimates only; UTC periods. Not all visitors. Cookie resets, consent expiry, privacy signals and blocked scripts reduce coverage. No identification or cross-device matching.";
  if (args.includes("--history")) {
    console.log(
      JSON.stringify(
        {
          coverage,
          aggregates: await db.analyticsAggregate.findMany({
            where: { startsAt: { gte: from, lt: to } },
            orderBy: [{ startsAt: "asc" }, { period: "asc" }],
          }),
        },
        null,
        2,
      ),
    );
  } else {
    if (+from < +now - ANALYTICS_DAYS * 86400000)
      throw new Error(
        "Raw data is retained for 35 days. Use --history for older finalized aggregates.",
      );
    console.log(
      JSON.stringify(
        {
          from,
          to,
          coverage,
          ...(await analyticsReport(db, from, to, args.includes("--include-demo"))),
        },
        null,
        2,
      ),
    );
  }
} finally {
  await db.$disconnect();
}
