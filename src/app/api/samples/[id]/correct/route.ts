import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { CORRECTION_MESSAGES } from "@/lib/report-amendment";
import { correctBeforeSend } from "@/lib/report-dispatch";

/**
 * « Corriger avant envoi » (lot 5A, K11 — Q132 of 20/11, « corriger sans
 * amendement : même numéro, sans « annule et remplace » »), behind
 * `UNSENT_REPORT_CORRECTED_IN_PLACE`. The roles of « Rouvrir pour
 * amendement » (the administrator, the Direction and the technical
 * validator, `REPORT_REOPEN_ROLES`), on a validated report the client never
 * received (`reportVersionSent` false), with a mandatory reason — internal,
 * never printed. The sample returns to RESULTATS_SAISIS, both signatures
 * cleared; the double validation that follows issues the same version again
 * in place (`reissueCorrectedReport`), the replaced one kept as an internal
 * trace. A report already sent is amended (`…/reopen`); a send under way or
 * recorded meanwhile refuses the correction (409). Journal:
 * REPORT_CORRECTED_BEFORE_SEND (written by `correctBeforeSend`).
 *
 * Body: `{ reason: string }`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiRole("VALIDATEUR", "DIRECTION", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const { reason } = (body ?? {}) as { reason?: unknown };
  // A missing reason is an invalid request (400), not a refused transition (409).
  if (typeof reason !== "string" || reason.trim().length < 3) {
    return NextResponse.json({ error: CORRECTION_MESSAGES.reason }, { status: 400 });
  }

  const outcome = await correctBeforeSend(id, { id: session.id, role: session.role, name: session.name }, reason);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });

  return NextResponse.json({
    status: "RESULTATS_SAISIS",
    number: outcome.number,
    version: outcome.version,
    frozen: outcome.frozen,
  });
}
