import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderPdf } from "@/lib/pdf";
import { BENCH_SHEET_MARGIN, buildBenchSheetHtml, type BenchSheetSample } from "@/lib/bench-sheet-html";
import { cartoucheTemplate } from "@/lib/cartouche-html";
import { getCompany } from "@/lib/company-server";
import { getDocumentReference } from "@/lib/document-reference";
import { documentLogo } from "@/lib/document-logo";
import { DOC_TYPE_LABELS } from "@/lib/document-types";
import { formatIsoDay } from "@/lib/labels";
import { labReference } from "@/lib/sample-select";
import { loadBenchPlans } from "@/lib/bench-plan";
import { benchQueueWhereFor, canEditParameter } from "@/lib/bench-access";
import { reportTechnicianNames } from "@/lib/report-programme";
import { sampleDesignation } from "@/lib/document-html";

/**
 * The printable bench sheet for a given day.
 *
 * `?date=YYYY-MM-DD` — defaults to today. It covers the samples currently on
 * the bench (programmed or under analysis, PROGRAMME.md §6) that were
 * received that day; a technician only gets the échantillons they hold or
 * share, and on a shared one only their own parameters — the sheet is theirs.
 * Every page carries the paper's quality cartouche (PG06/EN01).
 */
export async function GET(request: Request) {
  const session = await requireApiRole("PROGRAMMATEUR", "TECHNICIEN", "VALIDATEUR", "ADMIN");
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

  const rows = await prisma.sample.findMany({
    where: {
      ...benchQueueWhereFor(session),
      receivedAt: { gte: start, lt: end },
    },
    select: {
      id: true,
      code: true,
      controlCode: true,
      unitCount: true,
      serie: { select: { serialNumber: true } },
      type: true,
      lineKind: true,
      produit: true,
      surfaceLabel: true,
      surfaceState: true,
      personName: true,
      airMethod: true,
      numeroLot: true,
      client: { select: { name: true } },
      technicianId: true,
      technician: { select: { name: true } },
      parameters: {
        select: {
          technicianId: true,
          technician: { select: { name: true } },
          normVersion: { select: { label: true } },
          parameter: { select: { id: true, name: true, unit: true, threshold: true } },
        },
      },
    },
    // Received together, the two samples of an échantillon keep their order (« 1M », « 1P »).
    orderBy: [{ receivedAt: "asc" }, { code: "asc" }],
  });

  // The same criteria as the bench screen (product type, norm in force), so
  // the sheet carries m, M, c and the R1 … Rn cells the technician will key in.
  const samples: BenchSheetSample[] = await Promise.all(
    rows.map(async (row) => {
      const bench = await loadBenchPlans(row.id);
      const perUnit = bench.plans.size > 0 || row.unitCount > 1;
      // My sheet carries my parameters; the other roles print the whole échantillon.
      const lines =
        session.role === "TECHNICIEN"
          ? row.parameters.filter((line) => canEditParameter(row, line, session.id))
          : row.parameters;
      return {
        reference: labReference(row),
        serieNumber: row.serie.serialNumber,
        type: row.type,
        designation: sampleDesignation(row),
        numeroLot: row.numeroLot,
        clientName: row.client.name,
        technicianName: reportTechnicianNames(row),
        unitCount: perUnit ? Math.max(1, row.unitCount) : 1,
        parameters: lines.map(({ parameter, normVersion }) => {
          const plan = bench.plans.get(parameter.id);
          // The method: the programmed norm version, else the criterion's.
          const norm = normVersion?.label ?? plan?.normLabel ?? null;
          return {
            name: parameter.name,
            unit: plan?.unit ?? parameter.unit,
            threshold: plan ? `${plan.label}${norm ? ` · ${norm}` : ""}` : parameter.threshold,
          };
        }),
      };
    })
  );

  try {
    const [company, reference] = await Promise.all([getCompany(), getDocumentReference("FEUILLE_PAILLASSE")]);
    const header = cartoucheTemplate({
      title: DOC_TYPE_LABELS.FEUILLE_PAILLASSE,
      reference,
      logoDataUri: await documentLogo(company),
    });
    const pdf = await renderPdf(buildBenchSheetHtml(start, samples), { header, margin: BENCH_SHEET_MARGIN });
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
