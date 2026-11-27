// Seed: `npm run db:seed`. Safe to run many times.
// - Creates what is missing; never overwrites what an admin may have changed
//   (role names, role permissions, status names).
// - A permission that is new in the database is added to its default roles once. A permission
//   an admin removed from a role is never put back (rule in src/seed-rules.ts).
// - Permission descriptions belong to the code, so they are updated.
import { prisma } from "../src/client";
import { PERMISSIONS } from "../src/permission-keys";
import { DEFAULT_ROLES, rolePermissionsToAdd } from "../src/seed-rules";

// Status codes seen in testing. Names follow VICIdial's default system statuses;
// GVM and PVM are custom on our dialer and are left for the admin to name.
const STATUSES: { status: string; name: string | null }[] = [
  { status: "N", name: "No Answer" },
  { status: "CALLBK", name: "Call Back" },
  { status: "GVM", name: null },
  { status: "DAIR", name: "Dead Air" },
  { status: "A", name: "Answering Machine" },
  { status: "DNC", name: "Do Not Call" },
  { status: "NI", name: "Not Interested" },
  { status: "INCALL", name: "Lead Being Called" },
  { status: "B", name: "Busy" },
  { status: "DC", name: "Disconnected Number" },
  { status: "DEC", name: "Declined Sale" },
  { status: "NP", name: "No Pitch No Price" },
  { status: "PVM", name: null },
  { status: "XFER", name: "Call Transferred" },
  { status: "SALE", name: "Sale Made" },
];

async function main() {
  const known = new Set((await prisma.permission.findMany({ select: { key: true } })).map((p) => p.key));
  const newPermissionKeys = new Set(Object.keys(PERMISSIONS).filter((key) => !known.has(key)));
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, description },
      update: { description },
    });
  }

  let rolePermissionsAdded = 0;
  for (const role of DEFAULT_ROLES) {
    const existing = await prisma.role.findUnique({ where: { key: role.key }, select: { id: true } });
    const saved =
      existing ??
      (await prisma.role.create({
        data: { key: role.key, name: role.name, description: role.description, isSystem: true },
        select: { id: true },
      }));
    const keys = rolePermissionsToAdd(role, existing === null, newPermissionKeys);
    const { count } = await prisma.rolePermission.createMany({
      data: keys.map((permissionKey) => ({ roleId: saved.id, permissionKey })),
      skipDuplicates: true,
    });
    rolePermissionsAdded += count;
  }

  const { count: statusesAdded } = await prisma.vicidialStatus.createMany({
    data: STATUSES,
    skipDuplicates: true,
  });

  console.log(
    `seed done: ${Object.keys(PERMISSIONS).length} permissions (${newPermissionKeys.size} new), ` +
      `${DEFAULT_ROLES.length} roles, ${rolePermissionsAdded} role permissions added, ${statusesAdded} statuses added`,
  );
}

try {
  await main();
} catch (error) {
  console.error("seed FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
