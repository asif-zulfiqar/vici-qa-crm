// Connection check: `npm run check -w @vici/db`.
// Connects with the same client the api and worker use, counts profiles, prints "database OK".
import { prisma } from "./client";

try {
  const profiles = await prisma.profile.count();
  console.log(`database OK (profiles: ${profiles})`);
} catch (error) {
  // Print only the message: it names the problem without the connection string.
  console.error("database check FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
