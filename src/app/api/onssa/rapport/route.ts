import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getCompany } from "@/lib/company-server";
import { formatDateTime, formatDecimal } from "@/lib/labels";
import { ONSSA_COUNT_BY } from "@/lib/lab-proposals";
import { onssaFileName, onssaMonth } from "@/lib/onssa-report";
import { MAX_ONSSA_SAMPLES, loadOnssaMonth } from "@/lib/onssa-report-server";
import { buildOnssaWorkbook } from "@/lib/onssa-workbook";
import { onssaCountBasisLabel } from "@/lib/onssa-access";

/**
 * Lot 3E, N3 — the ONSSA monthly activity report as Excel
 * (`?mois=AAAA-MM`): the canevas' three sheets plus « Notes »
 * (`onssa-workbook.ts`), counted by `onssa-report.ts` from the month's
 * validated samples. The Direction, the administrator and the validateur
 * (RETOUR-LABO-28-10.md §5, N3). Journalled ONSSA_REPORT_EXPORTED.
 *
 * Served at /api/onssa/rapport, not /api/reports/onssa as first planned:
 * /api/reports/ is the analysis reports' space, closed to the Direction.
 */
export async function GET(request: Request) {
  const session = await requireApiRole("VALIDATEUR", "DIRECTION", "ADMIN");
  if (session instanceof NextResponse) return session;

  const month = onssaMonth(new URL(request.url).searchParams.get("mois"));
  if (!month) return NextResponse.json({ error: "Choisissez un mois (AAAA-MM)." }, { status: 400 });

  try {
    const [data, company] = await Promise.all([loadOnssaMonth(month), getCompany()]);
    if (data.tooMany) {
      return NextResponse.json(
        { error: `Plus de ${formatDecimal(MAX_ONSSA_SAMPLES, 0)} échantillons ce mois-ci : le rapport ne peut pas être généré.` },
        { status: 400 }
      );
    }
    const workbook = buildOnssaWorkbook(data.report, {
      monthLabel: month.label,
      labName: company.name,
      generatedAt: formatDateTime(new Date()),
      countBasis: onssaCountBasisLabel(ONSSA_COUNT_BY),
      pendingSamples: data.pendingSamples,
    });
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await logAudit({
      actorId: session.id,
      action: "ONSSA_REPORT_EXPORTED",
      entity: "OnssaReport",
      entityId: month.month,
      metadata: {
        mois: month.month,
        echantillons: data.report.declaredSamples,
        analyses: data.report.total.realisees,
        nonConformes: data.report.total.nonConformes,
        enAttente: data.pendingSamples,
      },
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${onssaFileName(month.month)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[reports/onssa] failed", error);
    return NextResponse.json({ error: "Le rapport n'a pas pu être généré. Réessayez." }, { status: 500 });
  }
}
