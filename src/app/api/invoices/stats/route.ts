import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";

/**
 * Invoice headline figures, aggregated by the database over every invoice —
 * the list on screen only ever shows one page (FACTURATION.md §4):
 *
 *  - drafts and cancelled invoices are counted apart, never in the figures;
 *  - billed (`totalBilled`) = issued, non-cancelled invoices − credit notes;
 *  - collected = the sum of the settlements;
 *  - outstanding = the sum of what is left to pay on each issued invoice
 *    (never negative per invoice: a credit note on a paid invoice is a
 *    refund, not a negative balance).
 *
 * `count` and `thisMonth` count issued, non-cancelled invoices (credit notes
 * apart); `thisMonth` by issue date.
 */
export async function GET() {
  const session = await requireApiRole("COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [groups, thisMonth, payments, outstandingRows] = await Promise.all([
    prisma.invoice.groupBy({
      by: ["kind", "status"],
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.invoice.count({
      where: { kind: "FACTURE", status: { in: ["EN_ATTENTE", "PAYEE"] }, issuedAt: { gte: startOfMonth } },
    }),
    prisma.payment.aggregate({ _sum: { amount: true }, _count: { _all: true } }),
    prisma.$queryRaw<{ outstanding: unknown; open_count: unknown }[]>`
      SELECT
        COALESCE(SUM(GREATEST(0, i.\`total\` - COALESCE(c.credited, 0) - COALESCE(p.paid, 0))), 0) AS outstanding,
        COALESCE(SUM(CASE WHEN i.\`total\` - COALESCE(c.credited, 0) - COALESCE(p.paid, 0) > 0 THEN 1 ELSE 0 END), 0) AS open_count
      FROM \`Invoice\` i
      LEFT JOIN (
        SELECT \`creditedInvoiceId\` AS id, SUM(\`total\`) AS credited
        FROM \`Invoice\`
        WHERE \`kind\` = 'AVOIR' AND \`creditedInvoiceId\` IS NOT NULL
        GROUP BY \`creditedInvoiceId\`
      ) c ON c.id = i.\`id\`
      LEFT JOIN (
        SELECT \`invoiceId\` AS id, SUM(\`amount\`) AS paid
        FROM \`Payment\`
        GROUP BY \`invoiceId\`
      ) p ON p.id = i.\`id\`
      WHERE i.\`kind\` = 'FACTURE' AND i.\`status\` IN ('EN_ATTENTE', 'PAYEE')`,
  ]);

  const bucket = (match: (group: (typeof groups)[number]) => boolean) => {
    const rows = groups.filter(match);
    return {
      count: rows.reduce((sum, row) => sum + row._count._all, 0),
      total: toMoney(rows.reduce((sum, row) => sum + Math.round(toMoney(row._sum.total) * 100), 0) / 100),
    };
  };

  const issued = bucket((g) => g.kind === "FACTURE" && (g.status === "EN_ATTENTE" || g.status === "PAYEE"));
  const paid = bucket((g) => g.kind === "FACTURE" && g.status === "PAYEE");
  const drafts = bucket((g) => g.kind === "FACTURE" && g.status === "BROUILLON");
  const cancelled = bucket((g) => g.kind === "FACTURE" && g.status === "ANNULEE");
  const creditNotes = bucket((g) => g.kind === "AVOIR");

  const billed = toMoney((Math.round(issued.total * 100) - Math.round(creditNotes.total * 100)) / 100);
  const outstanding = toMoney(outstandingRows[0]?.outstanding as never);

  return NextResponse.json({
    // Kept from before drafts, with today's meaning.
    count: issued.count,
    totalBilled: billed,
    thisMonth,
    billed,
    collected: toMoney(payments._sum.amount),
    paymentsCount: payments._count._all,
    outstanding,
    openCount: Number(outstandingRows[0]?.open_count ?? 0),
    issued,
    paid,
    drafts,
    cancelled,
    creditNotes,
  });
}
