import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { auth } from "@/lib/auth-server";
import { internalEmailFor } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ROLES, type Role } from "@/lib/roles";

/**
 * The laboratory's user accounts.
 *
 * Accounts are provisioned here by the admin — public sign-up is disabled.
 * Creation goes through Better Auth so the credentials are hashed exactly as
 * the runtime expects.
 */
export async function GET() {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      banned: true,
      createdAt: true,
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { name, username, password, role } = (body ?? {}) as {
    name?: unknown;
    username?: unknown;
    password?: unknown;
    role?: unknown;
  };

  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanUsername =
    typeof username === "string" ? username.trim().toLowerCase() : "";

  if (!cleanName) {
    return NextResponse.json({ error: "Le nom est obligatoire." }, { status: 400 });
  }
  if (!/^[a-z0-9._-]{3,30}$/.test(cleanUsername)) {
    return NextResponse.json(
      {
        error:
          "L'identifiant doit faire 3 à 30 caractères (lettres, chiffres, . _ -).",
      },
      { status: 400 }
    );
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Le mot de passe doit faire au moins 8 caractères." },
      { status: 400 }
    );
  }
  if (typeof role !== "string" || !ROLES.includes(role as Role)) {
    return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });
  }

  const taken = await prisma.user.findFirst({
    where: { username: cleanUsername },
    select: { id: true },
  });
  if (taken) {
    return NextResponse.json(
      { error: "Cet identifiant est déjà utilisé." },
      { status: 409 }
    );
  }

  // Through Better Auth, so the password hash matches what sign-in expects.
  const created = await auth.api.createUser({
    body: {
      name: cleanName,
      email: internalEmailFor(cleanUsername),
      password,
      role: role as never,
      data: { username: cleanUsername, displayUsername: cleanUsername },
    },
  });

  await logAudit({
    actorId: session.id,
    action: "USER_CREATED",
    entity: "User",
    entityId: created.user.id,
    metadata: { username: cleanUsername, role },
  });

  return NextResponse.json(
    { id: created.user.id, username: cleanUsername, role },
    { status: 201 }
  );
}
