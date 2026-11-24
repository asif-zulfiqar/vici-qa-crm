// The one shared Prisma client for the api and the worker.
// Prisma 7 talks to Postgres through a "driver adapter": here @prisma/adapter-pg, which uses the
// standard `pg` driver. At runtime we use DATABASE_URL, the Supabase transaction pooler
// (port 6543), which shares a few real database connections between many requests.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
