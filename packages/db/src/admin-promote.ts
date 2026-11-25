// Makes one user an admin. A terminal command on purpose, not an HTTP route: nobody can make
// themselves admin over the internet.
//   npm run admin:promote -w @vici/db -- --email=person@example.com
// The person must have logged in once (that creates their profile).
import { parseEmailArg } from "./admin-promote-args";
import { prisma } from "./client";
import { ADMIN_ROLE_KEY } from "./permission-keys";

async function main(): Promise<void> {
  const email = parseEmailArg(process.argv.slice(2));

  const result = await prisma.$transaction(async (tx) => {
    const profile = await tx.profile.findUnique({
      where: { email },
      select: { id: true, role: { select: { key: true } } },
    });
    if (!profile) return { kind: "no-profile" as const };
    if (profile.role.key === ADMIN_ROLE_KEY) return { kind: "already" as const, id: profile.id };

    await tx.profile.update({
      where: { id: profile.id },
      data: { role: { connect: { key: ADMIN_ROLE_KEY } } },
    });
    await tx.auditLog.create({
      data: {
        actorId: null,
        action: "user.promote_cli",
        entity: "profile",
        entityId: profile.id,
        before: { role: profile.role.key },
        after: { role: ADMIN_ROLE_KEY },
      },
    });
    return { kind: "promoted" as const, id: profile.id };
  });

  if (result.kind === "no-profile") {
    console.error("no profile with that email: the person must log in to the dashboard once first");
    process.exitCode = 1;
  } else if (result.kind === "already") {
    console.log(`already an admin (profile ${result.id}), nothing changed`);
  } else {
    console.log(`promoted to admin (profile ${result.id}), audit_log row written`);
  }
}

try {
  await main();
} catch (error) {
  // Only the message: it names the problem without the connection string.
  console.error("admin:promote FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
