import "server-only";
import type { CompanyInfo } from "./company";
import { getCompany } from "./company-server";
import { documentLogo } from "./document-logo";
import { getDocumentReference } from "./document-reference";
import { renderPdf } from "./pdf";
import { printReport, type ReportData, type ReportMarks } from "./report-html";

/**
 * The report as a PDF — the one path for the download, the duplicata, an
 * older version, the client portal and the e-mail attachment: the page and
 * its annex (`buildReportHtml`), the cartouche of the RAPPORT row of
 * /admin/documents with the laboratory's logo, and the footer built from
 * /admin/entreprise, all inside the page box `reportPdfMargin(marks)` that
 * the page's own `@page` declares too — printed by `printReport`, which
 * steps the type down until page 1 and the annex each hold on one page.
 *
 * A caller that already holds the identity passes it (the e-mail signs with
 * the same one); a missing cartouche row prints blank fields, never fails.
 */
export async function renderReportPdf(
  data: ReportData,
  options: { marks?: ReportMarks; company?: CompanyInfo } = {}
): Promise<Buffer> {
  const [company, reference] = await Promise.all([
    options.company ?? getCompany(),
    getDocumentReference("RAPPORT"),
  ]);
  return printReport(
    { data, company, reference, logoDataUri: await documentLogo(company), marks: options.marks },
    (parts) => renderPdf(parts.html, { header: parts.header, footer: parts.footer, margin: parts.margin })
  );
}
