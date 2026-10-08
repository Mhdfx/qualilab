import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { buildReportHtml, REPORT_PDF_MARGIN, type ReportData, type ReportMarks } from "@/lib/report-html";
import { renderPdf } from "@/lib/pdf";
import { loadReportData, loadReportVersion } from "@/lib/report-dispatch";
import { amendedNumber } from "@/lib/report-amendment";
import { getCompany } from "@/lib/company-server";

/**
 * Downloads the official analysis report as a PDF.
 *
 * The document is rendered on demand from the sample, its results and the
 * snapshot taken at approval — so it can be re-downloaded at any time and is
 * always identical to the one the client received.
 *
 * AMENDEMENT.md §3:
 * - `?duplicata=1` — the current version marked « DUPLICATA — édité le … »
 *   at the head and foot; journal REPORT_DUPLICATE.
 * - `?version=N` — a frozen version (history), read only, marked « Version
 *   remplacée par … » when it is no longer the current one.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole(
    "VALIDATEUR",
    "GESTIONNAIRE",
    "COMPTABLE",
    "ADMIN"
  );
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const duplicata = query.get("duplicata") === "1";
  const rawVersion = query.get("version");
  let requested: number | null = null;
  if (rawVersion !== null) {
    requested = /^\d{1,4}$/.test(rawVersion) ? Number(rawVersion) : -1;
    if (requested < 0) {
      return NextResponse.json({ error: "Version de rapport invalide." }, { status: 400 });
    }
  }

  const report = await prisma.report.findUnique({
    where: { sampleId: id },
    select: { id: true, number: true, version: true, amendmentPending: true },
  });

  if (!report) {
    const exists = await prisma.sample.findUnique({
      where: { id },
      select: { id: true },
    });
    return NextResponse.json(
      {
        error: exists
          ? "Aucun rapport : cet échantillon n'a pas encore reçu la validation administrative."
          : "Échantillon introuvable.",
      },
      { status: exists ? 409 : 404 }
    );
  }

  const current = amendedNumber(report.number, report.version);
  const marks: ReportMarks = {};
  let data: ReportData | null = null;
  if (requested === null) {
    data = await loadReportData(id);
  } else {
    const frozen = await loadReportVersion(report.id, requested);
    if (requested === report.version) {
      // The version in force prints exactly as the plain download does —
      // with the administrator's silent correction, which never reaches the
      // frozen row (`admin-edit`): one number, one document. A report never
      // amended may not be frozen yet: it is the live one.
      data = await loadReportData(id);
      marks.reconstructed = frozen?.reconstructed ?? false;
    } else if (frozen) {
      data = frozen.data;
      marks.reconstructed = frozen.reconstructed;
      marks.supersededBy = current;
    } else {
      return NextResponse.json({ error: "Cette version du rapport n'existe pas." }, { status: 404 });
    }
  }

  if (!data) {
    return NextResponse.json({ error: "Rapport indisponible." }, { status: 409 });
  }
  if (duplicata) marks.duplicataAt = new Date();

  try {
    const pdf = await renderPdf(buildReportHtml(data, await getCompany(), marks), { margin: REPORT_PDF_MARGIN });

    await logAudit({
      actorId: session.id,
      action: duplicata ? AUDIT_ACTIONS.REPORT_DUPLICATE : "REPORT_DOWNLOADED",
      entity: "Report",
      entityId: report.id,
      metadata: {
        number: data.number,
        ...(requested !== null ? { version: requested } : {}),
        ...(marks.supersededBy ? { supersededBy: marks.supersededBy } : {}),
      },
    });

    const filename = `${data.number}${duplicata ? "-duplicata" : ""}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[report] PDF generation failed", { sampleId: id, error });
    return NextResponse.json(
      { error: "Impossible de générer le rapport PDF." },
      { status: 500 }
    );
  }
}
