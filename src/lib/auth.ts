import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  organizationName: string;
  workspaceMode?: "MVP" | "ENTERPRISE";
}) {
  const email = input.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error("An account with this email already exists");
  }

  const baseSlug = slugify(input.organizationName) || "org";
  let slug = baseSlug;
  let counter = 1;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter++}`;
  }

  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: input.organizationName.trim(),
        slug,
        workspaceMode: input.workspaceMode ?? "ENTERPRISE",
      },
    });

    const user = await tx.user.create({
      data: {
        name: input.name.trim(),
        email,
        passwordHash,
        role: "ORG_ADMIN",
        organizationId: organization.id,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        action: "organization.created",
        entityType: "Organization",
        entityId: organization.id,
        metadataJson: JSON.stringify({ slug }),
      },
    });

    return { user, organization };
  });
}

export async function authenticateUser(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { organization: true },
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return null;
  }

  return user;
}
