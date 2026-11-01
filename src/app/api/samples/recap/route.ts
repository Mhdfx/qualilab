import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { formatDayShort, formatIsoDay } from "@/lib/labels";
import { SIEGE, parseSampleSearch, sampleConclusion, sampleSearchWhere, searchReceptionAt } from "@/lib/sample-search";
import { RECAP_SIEGE, buildSiteRecap, parseRecapOptions, type RecapSample } from "@/lib/sample-recap";

/**
 * « Récapitulatif par site » in Excel (RETOUR-LABO-28-10.md L1 — Q115 and
 * the laboratory's empty workbook of 28/10): beside « Exporter en Excel » on
 * /recherche, with the same filters, the same roles and the same journal
 * (SAMPLES_EXPORTED, `kind`). One row per sample, by site; one column per
 * parameter present; « Conformité ». `mode=cnc` writes C / NC instead of the
 * value (R-21), `details=1` adds the reception date and the N° de contrôle.
 * Without a client chosen, a « Client » column comes first (rows grouped by
 * client, then by site).
 */

const MAX_ROWS = 5_000;

/** The verdict's fill: light, so the sheet still prints in black and white. */
const FILL = { NC: "FFF8D7DA", C: "FFDFF2E1", ACCEPTABLE: "FFFFF1C2" } as const;

export async function GET(request: Request) {
  const session = await requireApiRole("RECEPTIONNISTE", "PROGRAMMATEUR", "VALIDATEUR", "DIRECTION", "GESTIONNAIRE", "COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const params = new URL(request.url).searchParams;
  const search = parseSampleSearch(params);
  const options = parseRecapOptions(params);
  // A cancelled line is not an analysis: left out unless asked for, as the export.
  const excludeCancelled = search.state === null && search.status === null;
  const where = { ...sampleSearchWhere(search), ...(excludeCancelled ? { NOT: { status: "ANNULE" as const } } : {}) };

  const total = await prisma.sample.count({ where });
  if (total > MAX_ROWS) {
    return NextResponse.json(
      { error: `Trop de lignes (${total}) : réduisez la période ou choisissez un client (${MAX_ROWS} maximum).` },
      { status: 400 }
    );
  }

  const [samples, catalogue, client, site] = await Promise.all([
    prisma.sample.findMany({
      where,
      orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
      select: {
        code: true,
        controlCode: true,
        status: true,
        produit: true,
        receivedAt: true,
        client: { select: { name: true } },
        serie: { select: { site: { select: { name: true } }, arrivedAt: true } },
        report: { select: { interpretation: true } },
        results: {
          select: { parameterId: true, value: true, conform: true, interpretation: true, informalInterpretation: true },
        },
      },
    }),
    prisma.analysisParameter.findMany({ select: { id: true, name: true, aliases: true }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    search.clientId ? prisma.client.findUnique({ where: { id: search.clientId }, select: { name: true } }) : null,
    search.siteId && search.siteId !== SIEGE ? prisma.site.findUnique({ where: { id: search.siteId }, select: { name: true } }) : null,
  ]);

  const byClient = !search.clientId;
  const rows: RecapSample[] = samples.map((s) => ({
    clientName: s.client?.name ?? null,
    siteName: s.serie.site?.name ?? null,
    produit: s.produit,
    receptionAt: searchReceptionAt(s.receivedAt, s.serie.arrivedAt),
    controlCode: s.controlCode,
    code: s.code,
    status: s.status,
    conclusion: sampleConclusion(s),
    results: s.results,
  }));
  const table = buildSiteRecap(rows, catalogue, options.mode, byClient);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Qualilab";
  const sheet = workbook.addWorksheet("Récapitulatif par site", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const fixed = [
    ...(byClient ? [{ header: "Client", width: 28 }] : []),
    { header: "Site", width: 26 },
    { header: "Produit", width: 30 },
    ...(options.details ? [{ header: "Date de réception", width: 14 }, { header: "N° de contrôle", width: 14 }] : []),
  ];
  const headers = [...fixed.map((c) => c.header), ...table.columns.map((c) => c.label), "Conformité"];
  const width = headers.length;

  // Title lines: the client (or « Tous les clients »), the site, the period.
  const period =
    search.from || search.to
      ? `Période (${search.dateField === "prelevement" ? "prélèvement" : "réception"}) : ${search.from ? `du ${formatDayShort(search.from)}` : ""}${search.from && search.to ? " " : ""}${search.to ? `au ${formatDayShort(search.to)}` : ""}`
      : "Toutes les dates";
  const titles = [
    `Récapitulatif par site — ${client?.name ?? "tous les clients"}`,
    [search.siteId === SIEGE ? `Site : ${RECAP_SIEGE}` : site ? `Site : ${site.name}` : null, period].filter(Boolean).join(" · "),
  ];
  titles.forEach((text, i) => {
    const row = sheet.addRow([text]);
    sheet.mergeCells(row.number, 1, row.number, Math.max(1, width));
    row.font = i === 0 ? { bold: true, size: 13 } : { italic: true };
  });
  sheet.addRow([]);

  const head = sheet.addRow(headers);
  head.font = { bold: true };
  head.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  head.height = 42;
  head.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB4C6E7" } };
    cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  sheet.columns = [...fixed.map((c) => ({ width: c.width })), ...table.columns.map(() => ({ width: 14 })), { width: 22 }];

  for (const line of table.rows) {
    const values = [
      ...(byClient ? [line.client] : []),
      line.site,
      line.produit,
      ...(options.details ? [line.receptionAt ? formatDayShort(line.receptionAt) : "", line.controlCode] : []),
      ...line.cells.map((cell) => cell?.text ?? ""),
      line.conformity,
    ];
    const row = sheet.addRow(values);
    row.alignment = { vertical: "middle", wrapText: true };
    line.cells.forEach((cell, i) => {
      if (!cell?.verdict) return;
      const target = row.getCell(fixed.length + i + 1);
      const argb = cell.verdict === "NC" ? FILL.NC : cell.acceptable ? FILL.ACCEPTABLE : FILL.C;
      target.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
      target.alignment = { horizontal: "center", vertical: "middle" };
      if (cell.verdict === "NC") target.font = { bold: true, color: { argb: "FFA5203A" } };
    });
    const conformity = row.getCell(width);
    if (line.tone === "no") conformity.font = { bold: true, color: { argb: "FFA5203A" } };
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { top: { style: "hair" }, bottom: { style: "hair" }, left: { style: "thin" }, right: { style: "thin" } };
    });
  }
  sheet.views = [{ state: "frozen", ySplit: head.number, xSplit: byClient ? 3 : 2 }];
  if (table.rows.length > 0) sheet.autoFilter = { from: { row: head.number, column: 1 }, to: { row: head.number + table.rows.length, column: width } };
  if (table.rows.length === 0) sheet.addRow(["Aucun échantillon pour ces filtres."]);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const stamp = formatIsoDay(new Date());
  const slug = [client?.name ?? "analyses", search.siteId === SIEGE ? "siege" : site?.name]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  await logAudit({
    actorId: session.id,
    action: "SAMPLES_EXPORTED",
    entity: "Client",
    entityId: search.clientId,
    metadata: {
      kind: "recapitulatif-par-site",
      mode: options.mode,
      details: options.details,
      byClient,
      clientId: search.clientId,
      siteId: search.siteId,
      rows: table.rows.length,
      columns: table.columns.length,
      from: search.from ? formatIsoDay(search.from) : null,
      to: search.to ? formatIsoDay(search.to) : null,
      state: search.state,
      status: search.status,
      type: search.type,
      natureId: search.natureId,
      q: search.q,
    },
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="recapitulatif-par-site-${slug}-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
