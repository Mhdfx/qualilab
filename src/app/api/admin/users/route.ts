import { NextResponse } from "next/server";
import { isAPIError } from "better-auth/api";
import { requireApiRole } from "@/lib/auth";
import { auth } from "@/lib/auth-server";
import { internalEmailFor } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import type { PasswordChangeCause } from "@/lib/password-change";
import { prisma } from "@/lib/prisma";
import { PASSWORD_MAX_LENGTH, readClientId, userClientRefusal } from "@/lib/portal-access";
import { ASSIGNABLE_ROLES, PORTAL_ROLE, type Role } from "@/lib/roles";

/**
 * The laboratory's user accounts.
 *
 * Accounts are provisioned here by the admin — public sign-up is disabled.
 * Creation goes through Better Auth so the credentials are hashed exactly as
 * the runtime expects. A « Client (portail) » account carries its client
 * (PORTAIL.md §1): required for that role, refused for every other one.
 *
 * « Mot de passe à changer » (Q81, RETOUR-LABO-19-10.md H1): every account
 * created here — laboratory or portal — chooses its own password at its
 * first sign-in (`User.mustChangePassword`, written with the account;
 * journal USER_PASSWORD_CHANGE_REQUIRED). The list carries the flag for the
 * « Mot de passe à changer » badge.
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
      // « Dénomination sur les documents » (lot 1b): null = the default.
      documentName: true,
      // Q81: still to choose its own password.
      mustChangePassword: true,
      clientId: true,
      client: { select: { id: true, name: true, archived: true, mergedIntoId: true } },
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

  const { name, username, password, role, clientId } = (body ?? {}) as {
    name?: unknown;
    username?: unknown;
    password?: unknown;
    role?: unknown;
    clientId?: unknown;
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
  if (password.length > PASSWORD_MAX_LENGTH) {
    return NextResponse.json(
      { error: `Le mot de passe ne peut pas dépasser ${PASSWORD_MAX_LENGTH} caractères.` },
      { status: 400 }
    );
  }
  if (typeof role !== "string" || !ASSIGNABLE_ROLES.includes(role as Role)) {
    return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });
  }

  const cleanClientId = readClientId(clientId);
  const client = cleanClientId
    ? await prisma.client.findUnique({
        where: { id: cleanClientId },
        select: { id: true, name: true, archived: true, mergedIntoId: true },
      })
    : null;
  const clientRefusal = userClientRefusal(role, cleanClientId, client);
  if (clientRefusal) {
    return NextResponse.json({ error: clientRefusal }, { status: 400 });
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
  let created: Awaited<ReturnType<typeof auth.api.createUser>>;
  try {
    created = await auth.api.createUser({
      body: {
        name: cleanName,
        email: internalEmailFor(cleanUsername),
        password,
        role: role as never,
        // The client is written with the account, in the same insert
        // (`clientId` is a Better Auth additional field, auth-server.ts).
        // So is the password to change (Q81), a Better Auth additional field
        // too: the account never exists without it.
        data: {
          username: cleanUsername,
          displayUsername: cleanUsername,
          mustChangePassword: true,
          ...(role === PORTAL_ROLE && client ? { clientId: client.id } : {}),
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("[admin/users] création refusée", { username: cleanUsername, message });
    // The same identifier created at the same instant (double click): the
    // unique index refuses the second — the answer of the check above.
    if ((error as { code?: unknown }).code === "P2002" || /unique constraint/i.test(message)) {
      return NextResponse.json({ error: "Cet identifiant est déjà utilisé." }, { status: 409 });
    }
    // A refusal of the auth layer (identifier or password it will not
    // accept) is the administrator's to fix, not a server failure. Only its
    // own message is shown: a database error carries SQL and server paths.
    const shown = isAPIError(error) ? message : "";
    return NextResponse.json(
      { error: shown ? `Création refusée : ${shown}` : "Création refusée par le service d'authentification." },
      { status: 400 }
    );
  }

  // Belt and braces: should the auth layer ever drop the additional field,
  // the portal account still gets its client (a no-op when it is set).
  if (role === PORTAL_ROLE && client) {
    await prisma.user.updateMany({
      where: { id: created.user.id, clientId: null },
      data: { clientId: client.id },
    });
  }
  // The same for the password to change: the created row says whether it
  // was written; otherwise it is written now (the guards read it on every
  // request).
  if ((created.user as { mustChangePassword?: unknown }).mustChangePassword !== true) {
    await prisma.user.update({ where: { id: created.user.id }, data: { mustChangePassword: true } });
  }

  await logAudit({
    actorId: session.id,
    action: "USER_CREATED",
    entity: "User",
    entityId: created.user.id,
    metadata: {
      username: cleanUsername,
      role,
      ...(client ? { clientId: client.id, clientName: client.name } : {}),
    },
  });
  await logAudit({
    actorId: session.id,
    action: "USER_PASSWORD_CHANGE_REQUIRED",
    entity: "User",
    entityId: created.user.id,
    metadata: { username: cleanUsername, reason: "CREATED" satisfies PasswordChangeCause },
  });

  return NextResponse.json(
    { id: created.user.id, username: cleanUsername, role, clientId: client?.id ?? null, mustChangePassword: true },
    { status: 201 }
  );
}
