// Configuration for the Prisma CLI (generate, migrate, seed, studio).
// Prisma 7 does not read .env files by itself, so we load the root .env here.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // The CLI uses the session pooler (port 5432). Migrations need a normal session;
  // the transaction pooler (port 6543) is only for the running app.
  // `?? ""` keeps `prisma generate` working on a machine without a .env file.
  datasource: { url: process.env.DIRECT_URL ?? "" },
});
