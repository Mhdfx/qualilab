import { MessageSquareText } from "lucide-react";

/**
 * The réceptionniste's « Observation de réception » (Sample.receptionNote,
 * A7), shown read-only wherever the sample is worked on after reception:
 * the programme sheet, the bench and the validation page. Renders nothing
 * when no observation was written.
 */
export function ReceptionObservation({ note }: { note: string | null | undefined }) {
  const text = note?.trim();
  if (!text) return null;
  return (
    <div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
      <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      <p className="min-w-0">
        <b className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Observation de réception</b>
        <span className="whitespace-pre-line break-words">{text}</span>
      </p>
    </div>
  );
}
