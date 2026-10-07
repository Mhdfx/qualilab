import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getCompany } from "@/lib/company-server";
import { renderPdf } from "@/lib/pdf";
import { prisma } from "@/lib/prisma";
import { portalSampleByIdWhere } from "@/lib/portal-query";
import { portalNotFound, requirePortalApi } from "@/lib/portal-server";
import { reportAvailableOnPortal } from "@/lib/portal-status";
import { buildReportHtml, REPORT_PDF_MARGIN } from "@/lib/report-html";
import { loadReportData } from "@/lib/report-dispatch";

/**
 * The report of one of the client's samples, as a PDF (PORTAIL.md §2).
 *
 * Only a sample of the account's client (404 otherwise, whether the sample
 * exists or not), only once the report is sent (`RAPPORT_ENVOYE`), and only
 * its current version — the one `loadReportData` assembles, the same as the
 * laboratory's download. Journalised `REPORT_DOWNLOADED` with `portal: true`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePortalApi();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;

  const sample = await prisma.sample.findFirst({
    where: portalSampleByIdWhere(guard.clientId, id),
    select: { id: true, status: true, report: { select: { id: true, amendmentPending: true } } },
  });
  if (!sample) return portalNotFound();

  // A report reopened for amendment is not offered until the amended one is
  // sent (the sample is back « En analyse » meanwhile).
  if (!reportAvailableOnPortal(sample.status) || !sample.report || sample.report.amendmentPending) {
    return NextResponse.json(
      { error: "Le rapport de cet échantillon n'est pas encore disponible." },
      { status: 409 }
    );
  }

  const data = await loadReportData(sample.id);
  if (!data) {
    return NextResponse.json(
      { error: "Le rapport de cet échantillon n'est pas encore disponible." },
      { status: 409 }
    );
  }

  try {
    const pdf = await renderPdf(buildReportHtml(data, await getCompany()), { margin: REPORT_PDF_MARGIN });

    await logAudit({
      actorId: guard.session.id,
      action: "REPORT_DOWNLOADED",
      entity: "Report",
      entityId: sample.report.id,
      metadata: { number: data.number, portal: true, clientId: guard.clientId, sampleId: sample.id },
    });

    // The printed number may carry « / » or quotes in older data: keep the file name safe.
    const fileName = data.number.replace(/[^A-Za-z0-9._-]+/g, "-");
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[portail] PDF generation failed", { sampleId: sample.id, error });
    return NextResponse.json(
      { error: "Impossible de générer le rapport PDF. Réessayez dans un instant." },
      { status: 500 }
    );
  }
}
