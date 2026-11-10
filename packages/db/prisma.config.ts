import { config } from "dotenv";
import { defineConfig } from "prisma/config";
import { databaseEnv } from "@duel/domain/env";

config({ path: new URL("../../.env", import.meta.url).pathname, quiet: true });
// Generation is offline; database commands still require an actual DATABASE_URL.
const url = process.env.DATABASE_URL
  ? databaseEnv.parse(process.env).DATABASE_URL
  : "postgresql://duel:duel_local_only@localhost:5432/duel";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
