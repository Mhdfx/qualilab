import { emailStatusLabel } from "@/lib/email-log-filters";

const TONES: Record<string, string> = {
  ENVOYE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  SIMULE: "bg-amber-50 text-amber-800 ring-amber-200",
  ECHEC: "bg-rose-50 text-rose-700 ring-rose-200",
};

/** The status of one line of the send journal (EmailLog): words first, colour second. */
export function EmailStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
        TONES[status] ?? "bg-slate-100 text-slate-600 ring-slate-200"
      }`}
    >
      {emailStatusLabel(status)}
    </span>
  );
}
