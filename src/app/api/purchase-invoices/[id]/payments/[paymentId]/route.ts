import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { removePurchasePayments } from "@/lib/purchase-payments-server";

/**
 * Cancelling one payment recorded by mistake (lot 3D, M1): the payment is
 * removed and the invoice is « à payer » again for that amount. Journalled
 * with the payment's day, amount, method and reference.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id, paymentId } = await params;
  return removePurchasePayments(id, paymentId, session.id);
}
