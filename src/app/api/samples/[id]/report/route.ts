import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { buildReportHtml } from "@/lib/report-html";
import { renderPdf } from "@/lib/pdf";
import { loadReportData } from "@/lib/report-dispatch";

/**
 * Downloads the official analysis report as a PDF.
 *
 * The document is rendered on demand from the sample, its results and the
 * snapshot taken at approval — so it can be re-downloaded at any time and is
 * always identical to the one the client received.
 */
export async function GET(
  _request: Request,
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

  const data = await loadReportData(id);

  if (!data) {
    const exists = await prisma.sample.findUnique({
      where: { id },
      select: { id: true },
    });
    return NextResponse.json(
      {
        error: exists
          ? "Aucun rapport : cet échantillon n'a pas encore été approuvé."
          : "Échantillon introuvable.",
      },
      { status: exists ? 409 : 404 }
    );
  }

  try {
    const pdf = await renderPdf(buildReportHtml(data));

    await logAudit({
      actorId: session.id,
      action: "REPORT_DOWNLOADED",
      entity: "Report",
      entityId: id,
      metadata: { number: data.number },
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${data.number}.pdf"`,
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
