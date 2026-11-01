import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { recordPurchasePayment } from "@/lib/purchase-payments-server";

/**
 * One payment of a supplier invoice (lot 3D, M1, M6): `paidOn` (today on the
 * lab's clock by default, never in the future nor before the invoice),
 * `method` (required), `reference`, `amount` (empty = all that is left; a
 * part only while `PURCHASE_PARTIAL_PAYMENTS` is on). The invoice is
 * « Payée » once its payments reach the net à payer. Journalled.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  return recordPurchasePayment(id, (body ?? {}) as Record<string, unknown>, session.id);
}
