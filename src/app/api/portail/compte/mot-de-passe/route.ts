import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { changeOwnPassword } from "@/lib/password-change-server";

/**
 * « Mon compte » (PORTAIL.md §2): the client changes their own password,
 * through Better Auth (`changePassword`, which checks the current one). The
 * other sessions of the account are closed; the session cookie Better Auth
 * renews is passed back so this one stays open. Five wrong current
 * passwords in 15 minutes lock the change for the account (429).
 *
 * Open to a portal account even when its client is closed: changing one's
 * password reveals nothing of the laboratory's data. The laboratory's staff
 * use `POST /api/compte/mot-de-passe` — same rule (`changeOwnPassword`).
 */
export async function POST(request: Request) {
  const session = await requireApiRole("CLIENT");
  if (session instanceof NextResponse) return session;
  return changeOwnPassword(request, session, { portal: true });
}
