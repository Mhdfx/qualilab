import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { formatDayShort, formatIsoDay } from "@/lib/labels";
import { SIEGE, parseSampleSearch } from "@/lib/sample-search";
import { searchSamples } from "@/lib/sample-search-server";

/**
 * The client summary exported to Excel (RETOUR-LABO-29-09.md, slice F):
 * the same filters as the search screen, one row per sample, sorted by date,
 * in the laboratory's columns — N° BC (the série, Q37), N° (contrôle), date de
 * réception, produit, analyse, lot, conclusion. A « Site » column follows the
 * client as soon as one exported row was sampled on a site (RETOUR-LABO-06-10.md
 * §5, V5). Audited.
 */

const MAX_ROWS = 20_000;

export async function GET(request: Request) {
  const session = await requireApiRole("RECEPTIONNISTE", "PROGRAMMATEUR", "VALIDATEUR", "GESTIONNAIRE", "COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const search = parseSampleSearch(new URL(request.url).searchParams);
  // A cancelled line is not an analysis: it is left out unless asked for
  // (« Annulées », or the exact step « Annulé »).
  const excludeCancelled = search.state === null && search.status === null;
  const { rows, total } = await searchSamples(search, { take: MAX_ROWS, excludeCancelled });
  if (total > MAX_ROWS) {
    return NextResponse.json(
      { error: `Trop de lignes (${total}) : réduisez la période ou choisissez un client (${MAX_ROWS} maximum).` },
      { status: 400 }
    );
  }
  // Oldest first: a summary reads like a register.
  rows.reverse();

  const [client, site] = await Promise.all([
    search.clientId ? prisma.client.findUnique({ where: { id: search.clientId }, select: { name: true } }) : null,
    search.siteId && search.siteId !== SIEGE ? prisma.site.findUnique({ where: { id: search.siteId }, select: { name: true } }) : null,
  ]);
  // A client without sites keeps the export it always had.
  const withSite = rows.some((row) => row.siteName !== null);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Qualilab";
  const sheet = workbook.addWorksheet("Analyses");
  sheet.columns = [
    ...(client ? [] : [{ header: "Client", key: "client", width: 28 }]),
    ...(withSite ? [{ header: "Site", key: "site", width: 24 }] : []),
    { header: "N° BC", key: "bc", width: 12 },
    { header: "N°", key: "n", width: 12 },
    { header: "Date de réception", key: "received", width: 16 },
    { header: "Nom produit", key: "produit", width: 32 },
    { header: "Analyses", key: "analyse", width: 34 },
    { header: "N° de lot", key: "lot", width: 16 },
    { header: "Conclusion", key: "conclusion", width: 26 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const row of rows) {
    sheet.addRow({
      client: row.clientName,
      site: row.siteName ?? "",
      bc: row.serialNumber,
      n: row.controlCode ?? row.code,
      // The lab's calendar day, as text: an Excel date is UTC and would slip a day at night.
      received: row.receivedAt ? formatDayShort(row.receivedAt) : "",
      produit: row.produit ?? "",
      analyse: `${row.nature}${row.parameters.length ? ` — ${row.parameters.join(", ")}` : ""}`,
      lot: row.numeroLot ?? "",
      conclusion: row.conclusion.label,
    });
  }

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
      clientId: search.clientId,
      siteId: search.siteId,
      rows: rows.length,
      from: search.from ? formatIsoDay(search.from) : null,
      to: search.to ? formatIsoDay(search.to) : null,
      state: search.state,
      status: search.status,
      type: search.type,
      withReport: search.withReport,
      natureId: search.natureId,
      q: search.q,
    },
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="synthese-${slug}-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
