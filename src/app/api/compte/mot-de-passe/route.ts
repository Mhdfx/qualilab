import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { changeOwnPassword } from "@/lib/password-change-server";

/**
 * « Mon compte » of the laboratory's staff (/compte): a signed-in account
 * changes its own password. Every laboratory role, named one by one — never
 * the portal's CLIENT, which has its own route (/api/portail/compte/…).
 *
 * Better Auth checks the current password and closes the account's other
 * sessions (another PC still signed in on the account is signed out); the
 * renewed cookie is passed back. Journal: USER_PASSWORD_CHANGED
 * `{ username, portal: false }`. Five wrong current passwords in 15 minutes
 * lock the change for the account (429, `passwordChangeLimiter`).
 */
export async function POST(request: Request) {
  const session = await requireApiRole(
    "PRELEVEUR",
    "RECEPTIONNISTE",
    "PROGRAMMATEUR",
    "TECHNICIEN",
    "VALIDATEUR",
    "DIRECTION",
    "GESTIONNAIRE",
    "COMPTABLE",
    "MAGASINIER",
    "ADMIN"
  );
  if (session instanceof NextResponse) return session;
  return changeOwnPassword(request, session, { portal: false });
}
