import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { SERIES_VALIDATION } from "@/lib/lab-proposals";
import { approvalDispatch } from "@/lib/report-actions";
import {
  readSerieValidationAction,
  readSerieValidationRequest,
  serieActionRefusal,
  serieBatchSummary,
} from "@/lib/serie-validation";
import { runSerieValidation, serieHeader, serieValidationPlanFor } from "@/lib/validation-server";

/**
 * « Toute la série » at the validation desk (re-ask 2.16 — Q92 « avoir les
 * deux options », plan D4, switch `SERIES_VALIDATION`): the technical or
 * the administrative validation of every eligible sample of a série in one
 * action, IN ADDITION to sample by sample (`POST /api/samples/[id]/validation`).
 *
 * GET  `?action=validate|approve` — the plan the confirmation dialog shows:
 *      the samples it would sign, each with the regulation it records, and
 *      the ones set aside with their reason (`serieValidationPlan`).
 * POST `{ action, send?, samples: [{ id, regulationId }] }` — signs the
 *      samples the dialog showed, each through the per-sample signature
 *      (`validateTechnically` / `approveSample`: same rules, same journal,
 *      `viaSerie` added), one by one — one refused or failing never undoes
 *      the others — and answers each sample's outcome. `send` is the
 *      approval's « Valider et envoyer » (`approvalDispatch`).
 *
 * The same guard as the per-sample route; who signs which step is decided
 * per sample by `canValidateTechnically` / `canApprove`.
 */

const DISABLED = "La validation par série n'est pas activée.";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("VALIDATEUR", "DIRECTION", "ADMIN");
  if (session instanceof NextResponse) return session;
  if (!SERIES_VALIDATION) return NextResponse.json({ error: DISABLED }, { status: 404 });

  const { id } = await params;
  const action = readSerieValidationAction(new URL(request.url).searchParams.get("action"));
  if (!action) return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  const refusal = serieActionRefusal(action, session.role);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

  const serie = await serieHeader(id);
  if (!serie) return NextResponse.json({ error: "Série introuvable." }, { status: 404 });

  const plan = await serieValidationPlanFor(serie.id, action, session);
  return NextResponse.json({ serie: { id: serie.id, serialNumber: serie.serialNumber, clientName: serie.client.name }, ...plan });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("VALIDATEUR", "DIRECTION", "ADMIN");
  if (session instanceof NextResponse) return session;
  if (!SERIES_VALIDATION) return NextResponse.json({ error: DISABLED }, { status: 404 });

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const input = readSerieValidationRequest(body);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
  const { action, samples } = input.value;
  const refusal = serieActionRefusal(action, session.role);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  // « Valider » or « Valider et envoyer »: read before anything is written;
  // a technical validation never sends anything.
  const dispatch = action === "approve" ? approvalDispatch(body) : { ok: true as const, sendReport: false };
  if (!dispatch.ok) return NextResponse.json({ error: dispatch.error }, { status: 400 });

  const serie = await serieHeader(id);
  if (!serie) return NextResponse.json({ error: "Série introuvable." }, { status: 404 });

  const lines = await runSerieValidation(serie, action, session, samples, { sendReport: dispatch.sendReport });
  return NextResponse.json({
    action,
    send: dispatch.sendReport,
    summary: serieBatchSummary(action, lines),
    lines,
  });
}
