import { z } from "zod";

export const databaseEnv = z.object({
  DATABASE_URL: z.url().refine((value) => /^postgres(ql)?:\/\//.test(value), {
    message: "DATABASE_URL must be a PostgreSQL connection URL",
  }),
});

export const realtimeEnv = z.object({
  WEB_ORIGIN: z.url().refine((value) => new URL(value).origin === value, {
    message: "WEB_ORIGIN must be an origin without a path or trailing slash",
  }),
  REALTIME_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
});
