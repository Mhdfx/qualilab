import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderPdf } from "@/lib/pdf";
import { buildBenchSheetHtml, type BenchSheetSample } from "@/lib/bench-sheet-html";
import { getCompany } from "@/lib/company-server";
import { getDocumentReference } from "@/lib/document-reference";
import { formatIsoDay } from "@/lib/labels";
import { labReference } from "@/lib/sample-select";
import { loadBenchPlans } from "@/lib/bench-plan";

/**
 * The printable bench sheet for a given day.
 *
 * `?date=YYYY-MM-DD` — defaults to today. It covers the samples currently on
 * the bench (received or under analysis) that were received that day; a
 * technician only gets their own.
 */
export async function GET(request: Request) {
  const session = await requireApiRole("TECHNICIEN", "VALIDATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;

  const requested = new URL(request.url).searchParams.get("date");
  const day = requested ? new Date(`${requested}T00:00:00`) : new Date();

  if (Number.isNaN(day.getTime())) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const mine = session.role === "TECHNICIEN" ? { technicianId: session.id } : {};

  const rows = await prisma.sample.findMany({
    where: {
      ...mine,
      status: { in: ["RECU", "EN_ANALYSE"] },
      receivedAt: { gte: start, lt: end },
    },
    select: {
      id: true,
      code: true,
      controlCode: true,
      unitCount: true,
      serie: { select: { serialNumber: true } },
      type: true,
      produit: true,
      numeroLot: true,
      client: { select: { name: true } },
      technician: { select: { name: true } },
      parameters: {
        select: {
          parameter: { select: { id: true, name: true, unit: true, threshold: true } },
        },
      },
    },
    orderBy: { receivedAt: "asc" },
  });

  // The same criteria as the bench screen (product type, norm in force), so
  // the sheet carries m, M, c and the R1 … Rn cells the technician will key in.
  const samples: BenchSheetSample[] = await Promise.all(
    rows.map(async (row) => {
      const bench = await loadBenchPlans(row.id);
      const perUnit = bench.plans.size > 0 || row.unitCount > 1;
      return {
        reference: labReference(row),
        serieNumber: row.serie.serialNumber,
        type: row.type,
        produit: row.produit,
        numeroLot: row.numeroLot,
        clientName: row.client.name,
        technicianName: row.technician?.name ?? null,
        unitCount: perUnit ? Math.max(1, row.unitCount) : 1,
        parameters: row.parameters.map(({ parameter }) => {
          const plan = bench.plans.get(parameter.id);
          return {
            name: parameter.name,
            unit: plan?.unit ?? parameter.unit,
            threshold: plan ? `${plan.label}${plan.normLabel ? ` · ${plan.normLabel}` : ""}` : parameter.threshold,
          };
        }),
      };
    })
  );

  try {
    const [company, reference] = await Promise.all([getCompany(), getDocumentReference("FEUILLE_PAILLASSE")]);
    const pdf = await renderPdf(buildBenchSheetHtml(start, samples, company, reference));
    const stamp = formatIsoDay(start);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="paillasse-${stamp}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[bench-sheet] PDF generation failed", { error });
    return NextResponse.json(
      { error: "Impossible de générer la feuille de paillasse." },
      { status: 500 }
    );
  }
}
