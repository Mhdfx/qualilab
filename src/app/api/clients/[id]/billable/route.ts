import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { holdingInvoiceItemWhere, proposeLines, type CatalogueEntry } from "@/lib/billing";
import { BILLABLE_STATUSES } from "@/lib/billing-status";
import { toMoney } from "@/lib/money";

/**
 * A client's analyses that are ready to invoice.
 *
 * Since the programme d'analyse (PROGRAMME.md §6), a line is billable from
 * its confirmed programme on — `BILLABLE_STATUSES`, never a cancelled line —
 * and only those no draft or issued invoice line holds: that link is what
 * stops the laboratory billing the same analysis twice. A cancelled invoice
 * gives its samples back (FACTURATION.md §1). The status travels with
 * each line so the accountant sees which ones are invoiced before result.
 *
 * Billing clients (CLIENTS-FUSION.md §4): what is billable to a client is
 * its own samples — except those of its sites billed to another client —
 * plus the samples of the sites billed to it (its principal client's). Such
 * a sample carries `via: { siteName, clientId, clientName }`; the client's
 * own samples carry `via: null`.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  // `?brouillon=<id>`: the draft being edited. Its own samples are offered
  // again, so a line removed from it can be put back before saving. Only a
  // draft of this client is honoured; anything else is ignored.
  const draftId = new URL(request.url).searchParams.get("brouillon")?.trim() || null;
  const draft = draftId
    ? await prisma.invoice.findFirst({
        where: { id: draftId, clientId: id, kind: "FACTURE", status: "BROUILLON" },
        select: { id: true },
      })
    : null;

  const [samples, services] = await Promise.all([
    prisma.sample.findMany({
      where: {
        OR: [
          {
            clientId: id,
            // Not those of its sites billed to another client.
            NOT: { serie: { is: { site: { is: { billingClientId: { not: null }, NOT: { billingClientId: id } } } } } },
          },
          // The sites of its principal client billed to it.
          { serie: { is: { site: { is: { billingClientId: id } } } } },
        ],
        status: { in: [...BILLABLE_STATUSES] },
        // Not held by an invoice line: a draft reserves its samples, an
        // issued invoice bills them; a cancelled invoice releases them and a
        // credit note never holds one (FACTURATION.md §1–2).
        invoiceItems: { none: holdingInvoiceItemWhere(draft?.id) },
      },
      select: {
        id: true,
        code: true,
        controlCode: true,
        type: true,
        produit: true,
        status: true,
        programmedAt: true,
        validatedAt: true,
        clientId: true,
        report: { select: { amendmentPending: true } },
        client: { select: { name: true } },
        serie: { select: { site: { select: { name: true } } } },
        parameters: { select: { parameter: { select: { name: true } } } },
      },
      orderBy: [{ validatedAt: "asc" }, { programmedAt: "asc" }],
      take: 100,
    }),
    prisma.labService.findMany({
      select: { name: true, category: true, unitPrice: true, active: true },
    }),
  ]);

  const billable = samples.map((sample) => ({
    id: sample.id,
    code: sample.code,
    controlCode: sample.controlCode,
    type: sample.type,
    produit: sample.produit,
    status: sample.status,
    programmedAt: sample.programmedAt,
    validatedAt: sample.validatedAt,
    // Reopened for amendment: back to RESULTATS_SAISIS, but not « avant résultat ».
    amendmentPending: sample.report?.amendmentPending === true,
    via:
      sample.clientId === id
        ? null
        : { siteName: sample.serie.site?.name ?? null, clientId: sample.clientId, clientName: sample.client.name },
    parameters: sample.parameters.map(({ parameter }) => ({
      name: parameter.name,
    })),
  }));

  const catalogue: CatalogueEntry[] = services.map((service) => ({
    name: service.name,
    category: service.category,
    unitPrice: toMoney(service.unitPrice),
    active: service.active,
  }));

  return NextResponse.json({
    samples: billable,
    lines: proposeLines(billable, catalogue),
  });
}
