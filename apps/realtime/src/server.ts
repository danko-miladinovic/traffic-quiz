import { config } from "dotenv";
import { createDatabase } from "@duel/db";
import { databaseEnv, realtimeEnv } from "@duel/domain/env";
import { duelRulesSchema } from "@duel/domain/duel";
import { createDuelService } from "./service";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });
const env = realtimeEnv.safeParse(process.env);
const database = databaseEnv.safeParse(process.env);
const rules = duelRulesSchema.safeParse({
  questionMs: Number(process.env.DUEL_QUESTION_SECONDS ?? 20) * 1000,
  revealMs: Number(process.env.DUEL_REVEAL_SECONDS ?? 4) * 1000,
  reconnectMs: Number(process.env.DUEL_RECONNECT_SECONDS ?? 20) * 1000,
  startMs: 1000,
});
if (!env.success || !database.success || !rules.success) {
  console.error(
    "Invalid realtime configuration. Check DATABASE_URL, WEB_ORIGIN, REALTIME_PORT and DUEL_* timing settings.",
  );
  process.exit(1);
}
const db = createDatabase();
try {
  const service = await createDuelService(db, {
    connectionString: database.data.DATABASE_URL,
    webOrigin: env.data.WEB_ORIGIN,
    rules: rules.data,
    allowDemo: process.env.NODE_ENV !== "production" && process.env.PRACTICE_DEMO === "true",
  });
  try {
    await service.listen(env.data.REALTIME_PORT);
  } catch (error) {
    await service.close();
    throw error;
  }
  console.log(`Realtime ready on http://localhost:${env.data.REALTIME_PORT}/health`);
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void service
        .close()
        .then(() => db.$disconnect())
        .catch(() => {
          console.error("Realtime shutdown incomplete");
          process.exitCode = 1;
        });
    });
  service.http.on("close", () => {
    void db.$disconnect();
  });
} catch {
  console.error(
    "Realtime startup failed. Check database connectivity, migrations, port availability, and whether another realtime process is running.",
  );
  await db.$disconnect();
  process.exitCode = 1;
}
