import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { proposeLines, type CatalogueEntry } from "@/lib/billing";
import { BILLABLE_STATUSES } from "@/lib/billing-status";
import { toMoney } from "@/lib/money";

/**
 * A client's analyses that are ready to invoice.
 *
 * Since the programme d'analyse (PROGRAMME.md §6), a line is billable from
 * its confirmed programme on — `BILLABLE_STATUSES`, never a cancelled line —
 * and only those no invoice line already refers to: that link is what stops
 * the laboratory billing the same analysis twice. The status travels with
 * each line so the accountant sees which ones are invoiced before result.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const [samples, services] = await Promise.all([
    prisma.sample.findMany({
      where: {
        clientId: id,
        status: { in: [...BILLABLE_STATUSES] },
        // Not already on an invoice.
        invoiceItems: { none: {} },
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
