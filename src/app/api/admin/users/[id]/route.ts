import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { auth } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ROLES, type Role } from "@/lib/roles";

/**
 * Managing one account: change its role, disable or re-enable it, reset its
 * password. Disabling revokes the sessions too — a banned user must be out
 * now, not at their next login.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, role: true, banned: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
  }

  // The admin cannot disable or demote themselves — the laboratory would be
  // left without an administrator.
  if (user.id === session.id) {
    return NextResponse.json(
      { error: "Vous ne pouvez pas modifier votre propre compte ici." },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { role, banned, password } = (body ?? {}) as {
    role?: unknown;
    banned?: unknown;
    password?: unknown;
  };

  if (typeof role === "string") {
    if (!ROLES.includes(role as Role)) {
      return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });
    }
    await prisma.user.update({ where: { id }, data: { role } });
    await logAudit({
      actorId: session.id,
      action: "USER_ROLE_CHANGED",
      entity: "User",
      entityId: id,
      metadata: { username: user.username, from: user.role, to: role },
    });
  }

  if (typeof banned === "boolean") {
    await prisma.user.update({ where: { id }, data: { banned } });
    if (banned) {
      // Out now, not at the next login.
      await prisma.session.deleteMany({ where: { userId: id } });
    }
    await logAudit({
      actorId: session.id,
      action: banned ? "USER_DISABLED" : "USER_ENABLED",
      entity: "User",
      entityId: id,
      metadata: { username: user.username },
    });
  }

  if (typeof password === "string") {
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Le mot de passe doit faire au moins 8 caractères." },
        { status: 400 }
      );
    }
    const ctx = await auth.$context;
    await ctx.internalAdapter.updatePassword(id, await ctx.password.hash(password));
    await prisma.session.deleteMany({ where: { userId: id } });
    await logAudit({
      actorId: session.id,
      action: "USER_PASSWORD_RESET",
      entity: "User",
      entityId: id,
      metadata: { username: user.username },
    });
  }

  const updated = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, username: true, role: true, banned: true },
  });

  return NextResponse.json(updated);
}
