import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderPdf } from "@/lib/pdf";
import { getCompany } from "@/lib/company-server";
import { buildLabelsHtml, type LabelLine } from "@/lib/labels-html";
import { sampleDesignation } from "@/lib/document-html";

/**
 * The labels of a série — one per unit of every received sample, as a PDF
 * sheet. Only samples that carry a N° de contrôle print; a cancelled one
 * never does. The two samples of a two-family échantillon (« 1M » / « 1P »)
 * each get their own labels, under their own N° de contrôle.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("RECEPTIONNISTE", "PROGRAMMATEUR", "TECHNICIEN", "VALIDATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const serie = await prisma.serie.findUnique({
    where: { id },
    // No client, no site: the labels go to the bench (blind numbering).
    select: {
      serialNumber: true,
      samples: {
        where: { controlCode: { not: null }, status: { not: "ANNULE" } },
        select: {
          controlCode: true,
          unitCount: true,
          lineKind: true,
          produit: true,
          surfaceLabel: true,
          surfaceState: true,
          personName: true,
          airMethod: true,
          receivedAt: true,
          nature: { select: { label: true } },
        },
        orderBy: [{ lineNumber: "asc" }, { code: "asc" }],
      },
    },
  });

  if (!serie) {
    return NextResponse.json({ error: "Série introuvable." }, { status: 404 });
  }
  if (serie.samples.length === 0) {
    return NextResponse.json(
      { error: "Aucun échantillon réceptionné : les étiquettes s'impriment après la réception." },
      { status: 409 }
    );
  }

  const lines: LabelLine[] = serie.samples.map((s) => ({
    controlCode: s.controlCode as string,
    unitCount: s.unitCount,
    natureLabel: s.nature.label,
    // « Planche verte — surface nettoyée », « Salle — Boîte exposée 30 min ».
    designation: sampleDesignation(s) ?? "",
    receivedAt: s.receivedAt,
  }));

  try {
    const pdf = await renderPdf(buildLabelsHtml(serie.serialNumber, lines, await getCompany()));
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="etiquettes-${serie.serialNumber.replace("/", "-")}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[labels] PDF generation failed", { serieId: id, error });
    return NextResponse.json({ error: "Impossible de générer les étiquettes." }, { status: 500 });
  }
}
