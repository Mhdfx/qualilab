import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { auth } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import { checkPortalPasswordChange, portalPasswordErrorMessage } from "@/lib/portal-access";

/**
 * « Mon compte » (PORTAIL.md §2): the client changes their own password,
 * through Better Auth (`changePassword`, which checks the current one). The
 * other sessions of the account are closed; the session cookie Better Auth
 * renews is passed back so this one stays open.
 *
 * Open to a portal account even when its client is closed: changing one's
 * password reveals nothing of the laboratory's data.
 */
export async function POST(request: Request) {
  const session = await requireApiRole("CLIENT");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const checked = checkPortalPasswordChange(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const response = await auth.api.changePassword({
    body: {
      currentPassword: checked.currentPassword,
      newPassword: checked.newPassword,
      revokeOtherSessions: true,
    },
    headers: await headers(),
    asResponse: true,
  });

  if (!response.ok) {
    let code: string | undefined;
    try {
      code = ((await response.json()) as { code?: string }).code;
    } catch {
      code = undefined;
    }
    const status = response.status === 401 ? 401 : response.status >= 500 ? 500 : 400;
    return NextResponse.json({ error: portalPasswordErrorMessage(code) }, { status });
  }

  await logAudit({
    actorId: session.id,
    action: "USER_PASSWORD_CHANGED",
    entity: "User",
    entityId: session.id,
    metadata: { username: session.username, portal: true },
  });

  const result = NextResponse.json({ ok: true });
  for (const cookie of response.headers.getSetCookie()) {
    result.headers.append("Set-Cookie", cookie);
  }
  return result;
}
