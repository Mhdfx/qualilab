import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { SERIES_VALIDATION } from "@/lib/lab-proposals";
import { readSerieSendRequest, serieBatchSummary } from "@/lib/serie-validation";
import { runSerieSend, serieHeader } from "@/lib/validation-server";

/**
 * « Envoyer la série au client » (re-ask 2.16 — Q92 « avoir les deux
 * options », plan D3, switch `SERIES_VALIDATION`): sends the report of
 * every sample the dialog listed that is still validated and not sent —
 * one e-mail per report, each through the per-sample send
 * (`sendReportWithAlerts`, the alerts riding along), one by one: a send
 * that fails is reported on its line and the others go on. A sample no
 * longer to send (sent meanwhile, reopened for amendment) is left
 * untouched and said so.
 *
 * `{ sampleIds: string[] }` → `{ summary, lines }`. The guard of the
 * per-sample send (`RESEND_REPORT_ROLES`).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("GESTIONNAIRE", "VALIDATEUR", "DIRECTION", "ADMIN");
  if (session instanceof NextResponse) return session;
  if (!SERIES_VALIDATION) {
    return NextResponse.json({ error: "L'envoi par série n'est pas activé." }, { status: 404 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const input = readSerieSendRequest(body);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const serie = await serieHeader(id);
  if (!serie) return NextResponse.json({ error: "Série introuvable." }, { status: 404 });

  // The série's number rides on each REPORT_SENT / CONTAMINATION_ALERT_SENT (`viaSerie`).
  const lines = await runSerieSend(serie, session.id, input.sampleIds);
  return NextResponse.json({ action: "send", summary: serieBatchSummary("send", lines), lines });
}
