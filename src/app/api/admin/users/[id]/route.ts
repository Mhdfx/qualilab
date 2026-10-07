import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { auth } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  PASSWORD_MAX_LENGTH,
  accountChangeClosesSessions,
  readClientId,
  userClientRefusal,
} from "@/lib/portal-access";
import { ASSIGNABLE_ROLES, PORTAL_ROLE, type Role } from "@/lib/roles";

/**
 * Managing one account: change its role (and, for a « Client (portail) »
 * account, its client — PORTAIL.md §1), disable or re-enable it, reset its
 * password. Disabling revokes the sessions too — a banned user must be out
 * now, not at their next login; so does any change of what a portal account
 * can see (role in or out of CLIENT, another client).
 *
 * Everything is checked before anything is written, so a refused field never
 * leaves the account half-changed.
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
    select: { id: true, username: true, role: true, banned: true, clientId: true },
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

  const fields = (body ?? {}) as {
    role?: unknown;
    clientId?: unknown;
    banned?: unknown;
    password?: unknown;
  };
  const { role, banned, password } = fields;
  const clientGiven = Object.prototype.hasOwnProperty.call(fields, "clientId");

  // ---- Checks -------------------------------------------------------------
  if (role !== undefined && (typeof role !== "string" || !ASSIGNABLE_ROLES.includes(role as Role))) {
    return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });
  }
  if (typeof password === "string" && password.length < 8) {
    return NextResponse.json(
      { error: "Le mot de passe doit faire au moins 8 caractères." },
      { status: 400 }
    );
  }
  if (typeof password === "string" && password.length > PASSWORD_MAX_LENGTH) {
    return NextResponse.json(
      { error: `Le mot de passe ne peut pas dépasser ${PASSWORD_MAX_LENGTH} caractères.` },
      { status: 400 }
    );
  }

  const touchesRole = typeof role === "string" || clientGiven;
  const nextRole = typeof role === "string" ? role : user.role;
  const requestedClientId = clientGiven ? readClientId(fields.clientId) : undefined;
  // Leaving the portal role clears the client; staying on it keeps the
  // current one unless another is given.
  const nextClientId =
    nextRole === PORTAL_ROLE
      ? requestedClientId !== undefined
        ? requestedClientId
        : user.clientId
      : requestedClientId ?? null;

  let client: { id: string; name: string; archived: boolean; mergedIntoId: string | null } | null = null;
  if (touchesRole) {
    client = nextClientId
      ? await prisma.client.findUnique({
          where: { id: nextClientId },
          select: { id: true, name: true, archived: true, mergedIntoId: true },
        })
      : null;
    const refusal = userClientRefusal(nextRole, nextClientId, client);
    if (refusal) return NextResponse.json({ error: refusal }, { status: 400 });
  }

  // ---- Writes -------------------------------------------------------------
  // One transaction for the whole request: the role/client, the ban and the
  // password land together or not at all, and the sessions are closed in the
  // same breath. The hash is computed first (it is slow, and outside the
  // transaction it holds no lock).
  const roleChanged = touchesRole && nextRole !== user.role;
  const clientChanged = touchesRole && nextClientId !== user.clientId;
  const scopeChanged = roleChanged || clientChanged;
  const banChanged = typeof banned === "boolean";
  const passwordHash =
    typeof password === "string" ? await (await auth.$context).password.hash(password) : null;
  // A portal account that sees something else (role in or out of CLIENT,
  // another client), a disabled account, a new password: out now, not at
  // the next login.
  const kick = accountChangeClosesSessions(
    { role: user.role, clientId: user.clientId },
    { role: nextRole, clientId: nextClientId },
    { banned: banChanged ? banned : undefined, passwordReset: passwordHash !== null }
  );

  if (scopeChanged || banChanged || passwordHash !== null) {
    await prisma.$transaction([
      ...(scopeChanged || banChanged
        ? [
            prisma.user.update({
              where: { id },
              data: {
                ...(scopeChanged ? { role: nextRole, clientId: nextClientId } : {}),
                ...(banChanged ? { banned } : {}),
              },
            }),
          ]
        : []),
      // What Better Auth's `internalAdapter.updatePassword` writes: the
      // credential account's hash.
      ...(passwordHash !== null
        ? [prisma.account.updateMany({ where: { userId: id, providerId: "credential" }, data: { password: passwordHash } })]
        : []),
      ...(kick ? [prisma.session.deleteMany({ where: { userId: id } })] : []),
    ]);
  }

  if (scopeChanged) {
    const portalMeta = {
      ...(user.clientId !== nextClientId ? { fromClientId: user.clientId, toClientId: nextClientId } : {}),
      ...(client && nextClientId ? { clientName: client.name } : {}),
    };
    await logAudit({
      actorId: session.id,
      action: roleChanged ? "USER_ROLE_CHANGED" : "USER_CLIENT_CHANGED",
      entity: "User",
      entityId: id,
      metadata: roleChanged
        ? { username: user.username, from: user.role, to: nextRole, ...portalMeta }
        : { username: user.username, ...portalMeta },
    });
  }

  if (banChanged) {
    await logAudit({
      actorId: session.id,
      action: banned ? "USER_DISABLED" : "USER_ENABLED",
      entity: "User",
      entityId: id,
      metadata: { username: user.username },
    });
  }

  if (passwordHash !== null) {
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
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      banned: true,
      clientId: true,
      client: { select: { id: true, name: true, archived: true, mergedIntoId: true } },
    },
  });

  return NextResponse.json(updated);
}
