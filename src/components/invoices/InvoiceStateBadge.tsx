import { INVOICE_STATE_LABELS, type InvoiceState } from "@/lib/invoice-lifecycle";
import { INVOICE_STATE_TONES } from "./invoice-view";

/**
 * How an invoice reads (FACTURATION.md §5): Brouillon, Émise, Partiellement
 * payée, Payée, Annulée — or Avoir. Text and colour, never colour alone.
 */
export function InvoiceStateBadge({ state, size = "md" }: { state: InvoiceState; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full font-semibold ring-1 ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs"
      } ${INVOICE_STATE_TONES[state]}`}
    >
      {INVOICE_STATE_LABELS[state]}
    </span>
  );
}
