// Argument of `admin:promote`, kept apart from the command so tests can import it.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reads `--email=person@example.com`. Returns it in lower case (Supabase stores emails so). */
export function parseEmailArg(args: readonly string[]): string {
  const arg = args.find((a) => a.startsWith("--email="));
  if (!arg) throw new Error("usage: npm run admin:promote -w @vici/db -- --email=person@example.com");
  const email = arg.slice("--email=".length).trim().toLowerCase();
  if (!EMAIL.test(email)) throw new Error("--email must be an email address");
  return email;
}
