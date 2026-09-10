/**
 * Ensure demo mock tenants exist for Overview packs:
 * - tpt@neoito.com → TPT Platform (TPT mock seed)
 * - connexus@neoito.com → Connexus (Connexus mock seed)
 *
 * Run: npx tsx scripts/ensure-demo-mock-tenants.ts
 */
import "dotenv/config";
import { hashPassword } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";
import { slugify } from "../src/lib/utils";

const DEMO_PASSWORD = "Password@123";

const TENANTS = [
  {
    email: "tpt@neoito.com",
    name: "TPT Admin",
    organizationName: "TPT Platform",
    preferredSlug: "tpt-platform",
  },
  {
    email: "connexus@neoito.com",
    name: "Connexus Admin",
    organizationName: "Connexus",
    preferredSlug: "connexus",
  },
] as const;

async function nextAvailableSlug(preferred: string): Promise<string> {
  const base = slugify(preferred) || preferred;
  let slug = base;
  let counter = 1;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    slug = `${base}-${counter++}`;
  }
  return slug;
}

async function ensureTenant(tenant: (typeof TENANTS)[number]) {
  const email = tenant.email.toLowerCase();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  let organization = await prisma.organization.findFirst({
    where: {
      OR: [{ slug: tenant.preferredSlug }, { name: tenant.organizationName }],
    },
  });

  if (!organization) {
    const slug = await nextAvailableSlug(tenant.preferredSlug);
    organization = await prisma.organization.create({
      data: {
        name: tenant.organizationName,
        slug,
        workspaceMode: "ENTERPRISE",
      },
    });
    console.log(`Created org ${organization.name} (${organization.slug}) id=${organization.id}`);
  } else {
    console.log(
      `Kept org ${organization.name} (${organization.slug}) id=${organization.id}`,
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (!existingUser) {
    const user = await prisma.user.create({
      data: {
        email,
        name: tenant.name,
        passwordHash,
        role: "ORG_ADMIN",
        organizationId: organization.id,
        status: "ACTIVE",
      },
    });
    console.log(`Created user ${user.email} id=${user.id} org=${organization.id}`);
    return { organization, user };
  }

  const user = await prisma.user.update({
    where: { id: existingUser.id },
    data: {
      name: tenant.name,
      passwordHash,
      role: "ORG_ADMIN",
      status: "ACTIVE",
      organizationId: organization.id,
    },
  });
  console.log(
    `Updated user ${user.email} id=${user.id} → org=${organization.id}`,
  );
  return { organization, user };
}

async function main() {
  for (const tenant of TENANTS) {
    await ensureTenant(tenant);
  }
  console.log("\nDemo logins (password Password@123):");
  for (const t of TENANTS) {
    console.log(`  ${t.email} → ${t.organizationName}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
