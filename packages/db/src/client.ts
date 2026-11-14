import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client";
import { databaseEnv } from "@duel/domain/env";

export function createDatabase() {
  const { DATABASE_URL } = databaseEnv.parse(process.env);
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: DATABASE_URL,
      connectionTimeoutMillis: 5000,
      max: 5,
    }),
  });
}

export type Database = ReturnType<typeof createDatabase>;
