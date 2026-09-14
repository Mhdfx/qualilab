import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderPdf } from "@/lib/pdf";
import { getCompany } from "@/lib/company-server";
import { getDocumentReference } from "@/lib/document-reference";
import { getLabSettings } from "@/lib/lab-settings";
import { HANDS_STATE_LABELS } from "@/lib/labels";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import {
  buildBonHtml,
  buildProtocolHtml,
  documentFooter,
  surfaceText,
  type DocumentLine,
  type SerieDocumentData,
} from "@/lib/document-html";

/**
 * The entry document of a série, kind-aware: the protocole de prélèvement
 * of a visit (printed on site for the interlocutor's signature — the
 * préleveur may print their own), the bon de réception of a deposit (lab
 * side only: it carries the N° de contrôle).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole(
    "PRELEVEUR",
    "RECEPTIONNISTE",
    "TECHNICIEN",
    "VALIDATEUR",
    "GESTIONNAIRE",
    "ADMIN"
  );
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const serie = await prisma.serie.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      serialNumber: true,
      clientReference: true,
      cadre: true,
      interlocutor: true,
      samplerKind: true,
      samplerName: true,
      startedAt: true,
      endedAt: true,
      arrivedAt: true,
      coolerTemperature: true,
      advanceAmount: true,
      advanceMode: true,
      analysesMicro: true,
      analysesChimie: true,
      notes: true,
      createdById: true,
      client: { select: { name: true, address: true, phone: true } },
      site: { select: { name: true } },
      samplerUser: { select: { name: true, role: true } },
      receivedBy: { select: { name: true } },
      samples: {
        select: {
          lineNumber: true,
          lineKind: true,
          status: true,
          produit: true,
          surfaceLabel: true,
          surfaceAreaCm2: true,
          personName: true,
          personRole: true,
          handsState: true,
          numeroLot: true,
          productionDate: true,
          expiryDate: true,
          quantity: true,
          quantityUnit: true,
          lieu: true,
          productTemperature: true,
          ambientTemperature: true,
          receptionTemperature: true,
          remarks: true,
          unitCount: true,
          controlCode: true,
          conformity: true,
          conformityReason: true,
          nature: { select: { family: true } },
          parameters: { select: { parameter: { select: { name: true } } } },
        },
        orderBy: { lineNumber: "asc" },
      },
    },
  });

  if (!serie) {
    return NextResponse.json({ error: "Série introuvable." }, { status: 404 });
  }
  // The blind rule: a préleveur prints their own protocol, never a bon.
  if (session.role === "PRELEVEUR" && (serie.createdById !== session.id || serie.kind !== "VISITE")) {
    return NextResponse.json({ error: "Série introuvable." }, { status: 404 });
  }

  const isDeposit = serie.kind === "DEPOT";
  const lines: DocumentLine[] = serie.samples.map((s) => ({
    lineNumber: s.lineNumber,
    lineKind: s.lineKind,
    designation:
      s.lineKind === "MAINS"
        ? `${s.personName ?? ""}${s.personRole ? ` — ${s.personRole}` : ""}${
            s.handsState ? ` (${HANDS_STATE_LABELS[s.handsState].toLowerCase()})` : ""
          }`
        : s.lineKind === "SURFACE"
          ? s.surfaceLabel ?? ""
          : s.produit ?? "",
    surface: surfaceText(s),
    numeroLot: s.numeroLot,
    productionDate: s.productionDate,
    expiryDate: s.expiryDate,
    quantity: s.quantity === null ? null : Number(s.quantity),
    quantityUnit: s.quantityUnit,
    lieu: s.lieu,
    productTemperature: s.productTemperature,
    ambientTemperature: s.ambientTemperature,
    receptionTemperature: s.receptionTemperature,
    remarks: s.remarks,
    unitCount: s.unitCount,
    family: s.nature.family,
    parameters: s.parameters.map((p) => p.parameter.name),
    // The protocol never carries the laboratory numbering.
    controlCode: isDeposit ? s.controlCode : null,
    conformity: isDeposit ? s.conformity : null,
    conformityReason: isDeposit ? s.conformityReason : null,
  }));

  const [company, reference, settings] = await Promise.all([
    getCompany(),
    getDocumentReference(isDeposit ? "BON_RECEPTION" : "PROTOCOLE"),
    isDeposit ? getLabSettings() : Promise.resolve(null),
  ]);

  const data: SerieDocumentData = {
    serialNumber: serie.serialNumber,
    clientReference: serie.clientReference,
    clientName: serie.client.name,
    clientAddress: serie.client.address,
    clientPhone: serie.client.phone,
    siteName: serie.site?.name ?? null,
    cadre: serie.cadre,
    interlocutor: serie.interlocutor,
    samplerKind: serie.samplerKind,
    samplerName: serie.samplerKind === "QUALILAB" ? serie.samplerUser?.name ?? null : serie.samplerName,
    samplerFunction:
      serie.samplerKind === "QUALILAB" && serie.samplerUser
        ? ROLE_LABELS[serie.samplerUser.role as Role] ?? serie.samplerUser.role
        : null,
    analysesMicro: serie.analysesMicro,
    analysesChimie: serie.analysesChimie,
    receivedByName: serie.receivedBy?.name ?? null,
    startedAt: serie.startedAt,
    endedAt: serie.endedAt,
    arrivedAt: serie.arrivedAt,
    coolerTemperature: serie.coolerTemperature,
    advanceAmount: serie.advanceAmount === null ? null : Number(serie.advanceAmount),
    advanceMode: serie.advanceMode,
    notes: serie.notes,
    lines,
    reference,
  };

  const html = isDeposit ? buildBonHtml(data, company, settings ?? undefined) : buildProtocolHtml(data, company);
  const stem = isDeposit ? "bon-reception" : "protocole";

  try {
    const pdf = await renderPdf(html, {
      footer: documentFooter(reference, company),
      margin: { top: "12mm", bottom: "16mm", left: "12mm", right: "12mm" },
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${stem}-${serie.serialNumber.replace("/", "-")}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[document] PDF generation failed", { serieId: id, error });
    return NextResponse.json({ error: "Impossible de générer le document." }, { status: 500 });
  }
}
