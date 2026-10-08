import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderPdf } from "@/lib/pdf";
import { getCompany } from "@/lib/company-server";
import { getDocumentReference } from "@/lib/document-reference";
import { documentLogo } from "@/lib/document-logo";
import { DOC_TYPE_LABELS } from "@/lib/document-types";
import { cartoucheTemplate } from "@/lib/cartouche-html";
import { getLabSettings } from "@/lib/lab-settings";
import { HANDS_STATE_LABELS } from "@/lib/labels";
import { sampleRef } from "@/lib/reception-input";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import {
  BON_MARGIN,
  PROTOCOL_MARGIN,
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
 *
 * The two samples of an échantillon whose two families are ticked
 * (« 1M » / « 1P », RETOUR-LABO-06-10.md §5, V3) print as one row on the
 * protocol and as two rows — one N° de contrôle each — on the bon.
 *
 * Both carry the paper's quality cartouche at the head of every page
 * (cartouche-html.ts); the protocol keeps the laboratory's coordinates as
 * its footer, the bon has none, as on the paper.
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
      cadreNote: true,
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
          code: true,
          lineNumber: true,
          lineKind: true,
          status: true,
          cancelReason: true,
          produit: true,
          surfaceLabel: true,
          surfaceAreaCm2: true,
          surfaceState: true,
          airMethod: true,
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
        // Line order, the microbiology sample (« 1M ») before the other.
        orderBy: [{ lineNumber: "asc" }, { code: "asc" }],
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
    cancelled: s.status === "ANNULE",
    destroyed: s.status === "ANNULE" && s.cancelReason === "DETRUIT_A_RECEPTION",
    lineNumber: s.lineNumber,
    ref: sampleRef(s.lineNumber, s.code),
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
    surfaceState: s.surfaceState,
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
  const header = cartoucheTemplate({
    title: DOC_TYPE_LABELS[reference.docType],
    reference,
    logoDataUri: await documentLogo(company),
  });

  const data: SerieDocumentData = {
    serialNumber: serie.serialNumber,
    clientReference: serie.clientReference,
    clientName: serie.client.name,
    clientAddress: serie.client.address,
    clientPhone: serie.client.phone,
    siteName: serie.site?.name ?? null,
    cadre: serie.cadre,
    cadreNote: serie.cadreNote,
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
  };

  const html = isDeposit ? buildBonHtml(data, settings ?? undefined) : buildProtocolHtml(data);
  const stem = isDeposit ? "bon-reception" : "protocole";

  try {
    const pdf = await renderPdf(
      html,
      isDeposit
        ? { header, margin: BON_MARGIN }
        : { header, footer: documentFooter(company), margin: PROTOCOL_MARGIN }
    );
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
