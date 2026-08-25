import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { buildReportHtml, type ReportData } from "@/lib/report-html";
import { renderPdf } from "@/lib/pdf";

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

  const sample = await prisma.sample.findUnique({
    where: { id },
    select: {
      controlCode: true,
      serialNumber: true,
      produit: true,
      numeroLot: true,
      lieu: true,
      type: true,
      sampledAt: true,
      receivedAt: true,
      user: { select: { name: true } },
      approvedBy: { select: { name: true } },
      client: { select: { name: true, address: true, ice: true } },
      report: true,
      results: {
        select: {
          value: true,
          unit: true,
          threshold: true,
          conform: true,
          note: true,
          parameter: { select: { name: true } },
        },
      },
    },
  });

  if (!sample) {
    return NextResponse.json(
      { error: "Échantillon introuvable." },
      { status: 404 }
    );
  }

  if (!sample.report) {
    return NextResponse.json(
      { error: "Aucun rapport : cet échantillon n'a pas encore été approuvé." },
      { status: 409 }
    );
  }

  const data: ReportData = {
    number: sample.report.number,
    controlCode: sample.controlCode,
    serialNumber: sample.serialNumber,
    client: sample.client,
    produit: sample.produit,
    numeroLot: sample.numeroLot,
    lieu: sample.lieu,
    type: sample.type,
    sampledAt: sample.sampledAt,
    receivedAt: sample.receivedAt,
    preleveur: sample.user.name,
    technicianName: sample.report.technicianName,
    validatorName: sample.report.validatorName,
    approverName: sample.approvedBy?.name ?? null,
    validatedAt: sample.report.validatedAt,
    conclusion: sample.report.conclusion ?? "",
    results: sample.results.map((result) => ({
      parameter: result.parameter.name,
      value: result.value,
      unit: result.unit,
      threshold: result.threshold,
      conform: result.conform,
      note: result.note,
    })),
  };

  try {
    const pdf = await renderPdf(buildReportHtml(data));

    await logAudit({
      actorId: session.id,
      action: "REPORT_DOWNLOADED",
      entity: "Report",
      entityId: sample.report.id,
      metadata: { number: sample.report.number },
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${sample.report.number}.pdf"`,
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
