import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderPdf } from "@/lib/pdf";
import { buildBenchSheetHtml, type BenchSheetSample } from "@/lib/bench-sheet-html";
import { getCompany } from "@/lib/company-server";

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
      serialNumber: true,
      controlCode: true,
      type: true,
      produit: true,
      numeroLot: true,
      client: { select: { name: true } },
      technician: { select: { name: true } },
      parameters: {
        select: {
          parameter: { select: { name: true, unit: true, threshold: true } },
        },
      },
    },
    orderBy: { receivedAt: "asc" },
  });

  const samples: BenchSheetSample[] = rows.map((row) => ({
    serialNumber: row.serialNumber,
    controlCode: row.controlCode,
    type: row.type,
    produit: row.produit,
    numeroLot: row.numeroLot,
    clientName: row.client.name,
    technicianName: row.technician?.name ?? null,
    parameters: row.parameters.map(({ parameter }) => ({
      name: parameter.name,
      unit: parameter.unit,
      threshold: parameter.threshold,
    })),
  }));

  try {
    const pdf = await renderPdf(buildBenchSheetHtml(start, samples, await getCompany()));
    const stamp = start.toISOString().slice(0, 10);

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
