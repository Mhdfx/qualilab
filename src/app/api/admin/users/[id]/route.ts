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
import { benchQueueWhereFor } from "@/lib/bench-access";
import { benchHoldWarning, leavesBench } from "@/lib/technician-load";
import { onlyDocumentNameChange, readDocumentName } from "@/lib/document-name";

/**
 * Managing one account: change its role (and, for a « Client (portail) »
 * account, its client — PORTAIL.md §1), disable or re-enable it, reset its
 * password, set its « Dénomination sur les documents » (`documentName`, lot
 * 1b — RETOUR-LABO-16-10.md D5: trimmed, 191 characters at most, empty =
 * back to the default « Technicien de QUALILAB 'I.NOM' »). The denomination
 * is the one field the administrator may change on their own account.
 * Disabling revokes the sessions too — a banned user must be out
 * now, not at their next login; so does any change of what a portal account
 * can see (role in or out of CLIENT, another client).
 *
 * Everything is checked before anything is written, so a refused field never
 * leaves the account half-changed.
 *
 * Prise en charge libre (PROGRAMME.md §10): an account leaving the bench —
 * disabled, or no longer a technician — while it still holds samples there
 * is never refused (a departure must take effect at once). The answer
 * carries a `warning` instead: those samples stay taken, and a colleague
 * cannot take them, until the admin gives them back to « À prendre »
 * (« Libérer », while nothing is typed) or finishes them.
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
    select: { id: true, username: true, role: true, banned: true, clientId: true, documentName: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
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
    documentName?: unknown;
  };

  // The admin cannot disable or demote themselves — the laboratory would be
  // left without an administrator. Their own denomination on the documents
  // changes nothing of the kind: it is the one field allowed here.
  if (user.id === session.id && !onlyDocumentNameChange(fields)) {
    return NextResponse.json(
      { error: "Vous ne pouvez pas modifier votre propre compte ici." },
      { status: 400 }
    );
  }

  const { role, banned, password } = fields;
  const clientGiven = Object.prototype.hasOwnProperty.call(fields, "clientId");
  const documentNameGiven = Object.prototype.hasOwnProperty.call(fields, "documentName");

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
  const documentName = documentNameGiven ? readDocumentName(fields.documentName) : null;
  if (documentName && !documentName.ok) {
    return NextResponse.json({ error: documentName.error }, { status: 400 });
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
  const nextDocumentName = documentName?.ok ? documentName.value : user.documentName;
  const documentNameChanged = nextDocumentName !== user.documentName;
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

  if (scopeChanged || banChanged || documentNameChanged || passwordHash !== null) {
    await prisma.$transaction([
      ...(scopeChanged || banChanged || documentNameChanged
        ? [
            prisma.user.update({
              where: { id },
              data: {
                ...(scopeChanged ? { role: nextRole, clientId: nextClientId } : {}),
                ...(banChanged ? { banned } : {}),
                ...(documentNameChanged ? { documentName: nextDocumentName } : {}),
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

  // What the account still holds at the bench when it leaves it — the
  // samples it took and the legacy parameter lines it was handed, the same
  // rule as the bench's « Mes analyses » (`benchQueueWhereFor`).
  const leaving = leavesBench(
    { role: user.role, banned: user.banned },
    { role: nextRole, banned: banChanged ? banned : user.banned }
  );
  const heldAtBench = leaving
    ? await prisma.sample.count({ where: benchQueueWhereFor({ id, role: "TECHNICIEN" }) })
    : 0;
  const warning = benchHoldWarning(heldAtBench);
  const benchMeta = heldAtBench > 0 ? { heldAtBench } : {};

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
        ? { username: user.username, from: user.role, to: nextRole, ...portalMeta, ...benchMeta }
        : { username: user.username, ...portalMeta },
    });
  }

  if (banChanged) {
    await logAudit({
      actorId: session.id,
      action: banned ? "USER_DISABLED" : "USER_ENABLED",
      entity: "User",
      entityId: id,
      // A departure with samples still taken at the bench: how many.
      metadata: { username: user.username, ...(banned ? benchMeta : {}) },
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

  if (documentNameChanged) {
    // null = the default « Technicien de QUALILAB 'I.NOM' », computed at print.
    await logAudit({
      actorId: session.id,
      action: "USER_DOCUMENT_NAME_CHANGED",
      entity: "User",
      entityId: id,
      metadata: { username: user.username, from: user.documentName, to: nextDocumentName },
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
      documentName: true,
      clientId: true,
      client: { select: { id: true, name: true, archived: true, mergedIntoId: true } },
    },
  });

  // The warning rides along with the account; the change itself is done.
  return NextResponse.json(warning ? { ...updated, warning } : updated);
}
