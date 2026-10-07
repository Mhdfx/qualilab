import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";

/**
 * Former « Marquer encaissée / Rouvrir » (status toggle). Retired by
 * FACTURATION.md §3: an invoice is settled by recording settlements
 * (POST /api/invoices/[id]/payments), and reopened by deleting one
 * (DELETE /api/invoices/[id]/payments/[paymentId], with a reason). A status
 * flipped by hand would no longer match « Reste à payer ».
 *
 * Kept only so a screen still calling it gets a clear answer instead of a
 * bare 405; remove once nothing calls it.
 */
export async function PATCH() {
  const session = await requireApiRole("COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  return NextResponse.json(
    {
      error:
        "« Marquer encaissée » est remplacé par « Enregistrer un règlement » : rechargez la fiche facture.",
    },
    { status: 410 }
  );
}
