import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { EmailType } from "@/generated/prisma/enums";
import { Card } from "@/components/ui/Card";
import { EmailStatusBadge } from "@/components/emails/EmailStatusBadge";
import { EMAIL_TYPE_LABELS } from "@/lib/email-log-filters";
import { formatDateTime } from "@/lib/labels";

export type EmailSendRow = {
  id: string;
  createdAt: Date;
  type: EmailType;
  to: string;
  status: string;
  error: string | null;
};

/**
 * « Envois » of one sample on the validation page: every message of the
 * send journal attached to its report (report, amended report, alerts sent
 * once it existed) and the contamination alerts sent at the technical
 * validation, before the report (`earlyAlertSendsOf`, alert-log-samples),
 * newest first — what « Dernier envoi à » alone could not say.
 */
export function EmailSendsCard({
  rows,
  more,
  journalHref,
}: {
  rows: EmailSendRow[];
  /** Older sends exist beyond the rows shown. */
  more: boolean;
  /** /admin/envois, for the administrator only. */
  journalHref: string | null;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Envois</h2>
        {journalHref && (
          <Link
            href={journalHref}
            className="inline-flex items-center gap-1 rounded text-xs font-medium text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Journal des envois
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">Aucun envoi enregistré pour ce rapport.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {rows.map((row) => (
            <li key={row.id} className="py-2.5">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-medium text-slate-800">{EMAIL_TYPE_LABELS[row.type]}</span>
                <EmailStatusBadge status={row.status} />
                <time dateTime={row.createdAt.toISOString()} className="text-xs tabular-nums text-slate-500">
                  {formatDateTime(row.createdAt)}
                </time>
              </p>
              <p className="mt-0.5 break-words text-xs text-slate-600">À : {row.to}</p>
              {row.error && <p className="mt-0.5 break-words text-xs text-rose-700">{row.error}</p>}
            </li>
          ))}
        </ul>
      )}
      {more && <p className="mt-2 text-xs text-slate-500">Les envois les plus récents sont affichés.</p>}
    </Card>
  );
}
