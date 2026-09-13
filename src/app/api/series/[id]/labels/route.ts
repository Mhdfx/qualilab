import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderPdf } from "@/lib/pdf";
import { getCompany } from "@/lib/company-server";
import { buildLabelsHtml, type LabelLine } from "@/lib/labels-html";

/**
 * The labels of a série — one per unit of every received line, as a PDF
 * sheet. Only lines that carry a N° de contrôle print; a cancelled line
 * never does.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("RECEPTIONNISTE", "TECHNICIEN", "VALIDATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const serie = await prisma.serie.findUnique({
    where: { id },
    select: {
      serialNumber: true,
      client: { select: { name: true } },
      site: { select: { name: true } },
      samples: {
        where: { controlCode: { not: null }, status: { not: "ANNULE" } },
        select: {
          controlCode: true,
          unitCount: true,
          produit: true,
          surfaceLabel: true,
          personName: true,
          receivedAt: true,
          nature: { select: { label: true } },
        },
        orderBy: { lineNumber: "asc" },
      },
    },
  });

  if (!serie) {
    return NextResponse.json({ error: "Série introuvable." }, { status: 404 });
  }
  if (serie.samples.length === 0) {
    return NextResponse.json(
      { error: "Aucune ligne réceptionnée : les étiquettes s'impriment après la réception." },
      { status: 409 }
    );
  }

  const lines: LabelLine[] = serie.samples.map((s) => ({
    controlCode: s.controlCode as string,
    unitCount: s.unitCount,
    natureLabel: s.nature.label,
    designation: s.produit ?? s.surfaceLabel ?? s.personName ?? "",
    clientName: serie.client.name,
    siteName: serie.site?.name ?? null,
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
