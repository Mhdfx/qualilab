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
import { labDayBounds } from "@/lib/lab-day-range";
import { labReference } from "@/lib/sample-select";
import { loadBenchPlans } from "@/lib/bench-plan";
import { benchQueueWhereFor, canEditParameter } from "@/lib/bench-access";
import { benchUnit } from "@/lib/bench-reading";
import { reportTechnicianNames } from "@/lib/report-programme";
import { sampleDesignation } from "@/lib/document-html";

/**
 * The printable bench sheet.
 *
 * It covers samples currently on the bench (programmed or under analysis).
 * A technician's sheet is theirs (prise en charge libre, PROGRAMME.md
 * §10.4): the samples they took — on a line programmed before 13/10 only
 * their own parameters — signed with their name; without `?date=` everything
 * they hold now, in the order they took it, with `?date=YYYY-MM-DD` those
 * received that day. Every other role prints a day's bench (`?date=`,
 * defaulting to today), sorted by holder — the free samples, « À prendre »,
 * first. Every page carries the paper's quality cartouche (PG06/EN01).
 */
export async function GET(request: Request) {
  const session = await requireApiRole("PROGRAMMATEUR", "TECHNICIEN", "VALIDATEUR", "DIRECTION", "ADMIN");
  if (session instanceof NextResponse) return session;
  const isTechnician = session.role === "TECHNICIEN";

  // The day on the laboratory's clock, as the sheet prints it — never the
  // runtime's local midnight (stale tzdata dated the sheet the day before).
  const requested = new URL(request.url).searchParams.get("date");
  const day = labDayBounds(requested, new Date());
  if (!day) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }
  const start = day.from;
  const end = day.until;
  // A technician's sheet without a date is everything they hold, whatever
  // day it was received: a sample taken today may have arrived yesterday.
  const byReception = !isTechnician || requested !== null;

  const rows = await prisma.sample.findMany({
    where: {
      ...benchQueueWhereFor(session),
      ...(byReception ? { receivedAt: { gte: start, lt: end } } : {}),
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
    // A technician's samples in the order they took them; another role's
    // per holder (MySQL sorts a missing holder first: « À prendre » leads).
    // Received together, the two samples of an échantillon keep their
    // order (« 1M », « 1P »).
    orderBy: isTechnician
      ? [{ assignedAt: "asc" }, { receivedAt: "asc" }, { code: "asc" }]
      : [{ technician: { name: "asc" } }, { receivedAt: "asc" }, { code: "asc" }],
  });

  // The same criteria as the bench screen (product type, norm in force), so
  // the sheet carries m, M, c and the R1 … Rn cells the technician will key in.
  const samples: BenchSheetSample[] = await Promise.all(
    rows.map(async (row) => {
      const bench = await loadBenchPlans(row.id);
      const perUnit = bench.plans.size > 0 || row.unitCount > 1;
      // My sheet carries my parameters; the other roles print the whole échantillon.
      const lines = isTechnician
        ? row.parameters.filter((line) => canEditParameter(row, line, session.id))
        : row.parameters;
      return {
        reference: labReference(row),
        serieNumber: row.serie.serialNumber,
        type: row.type,
        designation: sampleDesignation(row),
        numeroLot: row.numeroLot,
        // Null when nobody took it: the sheet prints « À prendre ».
        technicianName: reportTechnicianNames(row),
        unitCount: perUnit ? Math.max(1, row.unitCount) : 1,
        parameters: lines.map(({ parameter, normVersion }) => {
          const plan = bench.plans.get(parameter.id);
          // The method: the programmed norm version, else the criterion's.
          const norm = normVersion?.label ?? plan?.normLabel ?? null;
          return {
            name: parameter.name,
            unit: benchUnit(plan, parameter.unit),
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
    // A technician signs their own sheet; the other roles' is signed by hand.
    const html = buildBenchSheetHtml(start, samples, {
      printedFor: isTechnician ? session.name || session.username : undefined,
    });
    const pdf = await renderPdf(html, { header, margin: BENCH_SHEET_MARGIN });
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
