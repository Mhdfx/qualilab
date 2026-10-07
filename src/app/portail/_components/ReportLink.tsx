import { FileText } from "lucide-react";
import { portalReportHref } from "@/lib/portal-query";

/**
 * Download of a report through the portal route. A plain link (not a Next
 * <Link>): the PDF is rendered on demand and must never be prefetched.
 */
export function ReportLink({ sampleId, number }: { sampleId: string; number: string }) {
  return (
    <a
      href={portalReportHref(sampleId)}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      aria-label={`Télécharger le rapport ${number} (PDF)`}
    >
      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
      {number}
    </a>
  );
}
