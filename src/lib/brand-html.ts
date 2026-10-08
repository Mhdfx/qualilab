import type { CompanyInfo } from "./company";

/**
 * The brand block at the top of every printable document: the uploaded logo
 * (NEEDEDINFO item 5 — the lab's HD file lands in /admin/entreprise) or the
 * styled text while none exists. One place, so the report and the invoice
 * can never disagree on the identity. The quality forms (protocole, bon,
 * feuille de paillasse) print the logo in their cartouche instead
 * (cartouche-html.ts, document-logo.ts).
 *
 * The data URI needs no escaping — the upload route only accepts
 * `data:image/…;base64,` payloads, whose alphabet cannot break out of the
 * attribute — but the name in `alt` is escaped like any other text.
 */
export function companyBrandHtml(company: CompanyInfo): string {
  if (!company.logoData) {
    return `<div class="brand">QUALILAB <span>INTERNATIONAL</span></div>`;
  }
  const alt = company.name
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
  return `<img class="brand-logo" src="${company.logoData}" alt="${alt}">`;
}
