// Development helper: logs in to Supabase with an email and password and prints an access token
// (valid about 1 hour), so the api can be tried with curl.
//   npm run dev:token -w @vici/api
// Uses the public SUPABASE_PUBLISHABLE_KEY. The password is not shown while typing and is never
// printed or saved.
import { createInterface } from "node:readline/promises";
import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const tokenResponse = z.object({ access_token: z.string().min(1), expires_in: z.number() });
const errorResponse = z.object({
  msg: z.string().optional(),
  error_description: z.string().optional(),
  error_code: z.string().optional(),
});

/** Reads a line without showing what is typed. */
function askHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) throw new Error("run this in a terminal (the password must be typed)");
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") return finish();
        if (char === "\u0003") return finish(new Error("cancelled"));
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " ") value += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function main(): Promise<void> {
  const env = envSchema.safeParse(process.env);
  if (!env.success) {
    const names = [...new Set(env.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`check these variables in the root .env: ${names.join(", ")}`);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = (await rl.question("Email: ")).trim();
  rl.close();
  const password = await askHidden("Password (not shown): ");

  const response = await fetch(`${env.data.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.data.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = errorResponse.safeParse(body);
    const reason = error.success ? (error.data.msg ?? error.data.error_description ?? error.data.error_code) : undefined;
    throw new Error(`login failed (HTTP ${response.status})${reason ? `: ${reason}` : ""}`);
  }
  const token = tokenResponse.parse(body);

  console.log(`\nAccess token (valid ${Math.round(token.expires_in / 60)} minutes).`);
  console.log("NEVER paste this token anywhere (chat, tickets, screenshots): it is your login.\n");
  console.log(token.access_token);
}

main().catch((error: unknown) => {
  console.error(`dev:token failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
