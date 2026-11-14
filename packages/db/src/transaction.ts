import { Prisma } from "../generated/client";
import type { Database } from "./client";
import { setTimeout } from "node:timers/promises";

function retryable(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return (
      ["P2034", "P2002"].includes(error.code) ||
      (error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code)))
    );
  }
  // The PostgreSQL adapter can surface a serialization failure at COMMIT directly.
  if (error instanceof Error && error.cause && typeof error.cause === "object") {
    const cause = error.cause as { kind?: unknown; originalCode?: unknown };
    return (
      cause.kind === "TransactionWriteConflict" &&
      ["40001", "40P01"].includes(String(cause.originalCode))
    );
  }
  return false;
}

export async function transaction<T>(
  db: Database,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  for (let retry = 0; ; retry++) {
    try {
      return await db.$transaction(work, { isolationLevel: "Serializable", timeout: 15_000 });
    } catch (error) {
      if (retry < 5 && retryable(error)) {
        await setTimeout(10 * (retry + 1));
        continue;
      }
      throw error;
    }
  }
}
