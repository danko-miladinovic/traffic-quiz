import { createDatabase } from "./client";
import { cleanupPractice } from "./practice";

const db = createDatabase();
try {
  console.log(await cleanupPractice(db));
} finally {
  await db.$disconnect();
}
