import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { SERIES_VALIDATION } from "@/lib/lab-proposals";
import { serieHeader, serieSendPlanFor } from "@/lib/validation-server";

/**
 * The reports of a série as « Envoyer la série au client » sees them
 * (re-ask 2.16, plan D3, switch `SERIES_VALIDATION`): the validated reports
 * not sent yet, each with the number printed on its version in force, and
 * the samples set aside with their reason (`serieSendPlan`) — what the
 * confirmation dialog lists before `POST /api/series/[id]/reports/send`.
 *
 * The senders of a first report (`SEND_REPORT_ROLES` — never the
 * gestionnaire commercial since 28/10, K2: a série holds no report to resend).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("VALIDATEUR", "DIRECTION", "ADMIN");
  if (session instanceof NextResponse) return session;
  if (!SERIES_VALIDATION) {
    return NextResponse.json({ error: "L'envoi par série n'est pas activé." }, { status: 404 });
  }

  const { id } = await params;
  const serie = await serieHeader(id);
  if (!serie) return NextResponse.json({ error: "Série introuvable." }, { status: 404 });

  const plan = await serieSendPlanFor(serie.id);
  return NextResponse.json({ serie: { id: serie.id, serialNumber: serie.serialNumber, clientName: serie.client.name }, ...plan });
}
