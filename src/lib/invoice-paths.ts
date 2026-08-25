"use client";

import { usePathname } from "next/navigation";

/**
 * Where the invoice screens live for the person looking at them.
 *
 * The same screens are reachable by the admin and by the comptable, whose job
 * invoicing is. Rather than duplicating the components, they derive their links
 * from the space they are rendered in — so a comptable is never sent to an
 * admin-only route and bounced back.
 */
export function useInvoiceBasePath() {
  const pathname = usePathname();
  return pathname?.startsWith("/comptabilite")
    ? "/comptabilite/factures"
    : "/admin/factures";
}
