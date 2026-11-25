// Seed: `npm run db:seed`. Safe to run many times.
// - Creates what is missing; never overwrites what an admin may have changed
//   (role names, role permissions, status names).
// - Permission descriptions belong to the code, so they are updated.
import { prisma } from "../src/client";
import {
  ADMIN_ROLE_KEY,
  PENDING_ROLE_KEY,
  PERMISSION_KEYS,
  PERMISSIONS,
  type PermissionKey,
} from "../src/permission-keys";

const ALL = PERMISSION_KEYS;

const ROLES: { key: string; name: string; description: string; permissions: PermissionKey[] }[] = [
  { key: ADMIN_ROLE_KEY, name: "Admin", description: "Full access", permissions: ALL },
  {
    key: "sales_manager",
    name: "Sales manager",
    description: "Floor, agents, calls and results",
    permissions: [
      "live_floor.view",
      "agents.view",
      "calls.view",
      "calls.listen",
      "transfers.view",
      "callbacks.view",
      "reports.export",
    ],
  },
  {
    key: "team_lead",
    name: "Team lead",
    description: "Floor, agents and calls of their own team",
    permissions: ["live_floor.view", "agents.view", "calls.view", "calls.listen", "callbacks.view"],
  },
  {
    key: "hr",
    name: "HR",
    description: "Attendance and agent time",
    permissions: ["agents.view", "hr.view", "reports.export"],
  },
  {
    key: "qa",
    name: "QA",
    description: "Calls, transcripts and QA review",
    permissions: ["calls.view", "calls.listen", "calls.transcript", "qa.view", "qa.review"],
  },
  {
    key: "agent",
    name: "Agent",
    description: "Own stats and own QA results",
    permissions: ["agents.view_own", "qa.view_own"],
  },
  {
    // Given to every new login. They can log in but see nothing until an admin gives a real role.
    key: PENDING_ROLE_KEY,
    name: "Waiting for approval",
    description: "New user, no access yet",
    permissions: [],
  },
];

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
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, description },
      update: { description },
    });
  }

  let rolePermissionsAdded = 0;
  for (const role of ROLES) {
    const saved = await prisma.role.upsert({
      where: { key: role.key },
      create: { key: role.key, name: role.name, description: role.description, isSystem: true },
      update: {},
    });
    const { count } = await prisma.rolePermission.createMany({
      data: role.permissions.map((permissionKey) => ({ roleId: saved.id, permissionKey })),
      skipDuplicates: true,
    });
    rolePermissionsAdded += count;
  }

  const { count: statusesAdded } = await prisma.vicidialStatus.createMany({
    data: STATUSES,
    skipDuplicates: true,
  });

  console.log(
    `seed done: ${ALL.length} permissions, ${ROLES.length} roles, ` +
      `${rolePermissionsAdded} role permissions added, ${statusesAdded} statuses added`,
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
