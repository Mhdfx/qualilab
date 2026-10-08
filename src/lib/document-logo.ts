import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CompanyInfo } from "./company";

/**
 * The logo printed in the cartouche of the laboratory's forms, as a data
 * URI — a Chromium header template cannot fetch anything.
 *
 * The file uploaded in /admin/entreprise (the laboratory's HD original,
 * NEEDEDINFO item 5) wins; until then, the logo the web app already shows
 * (`public/qualilab-logo-nobg.png`, with « LABORATOIRE D'ANALYSES
 * AGROALIMENTAIRE / EAUX & ENVIRONNEMENT DE TRAVAIL » as on the paper). That
 * file is read once per process; a failed read is retried on the next print
 * and leaves the logo cell blank meanwhile — a form never fails for its logo.
 */

const FALLBACK_LOGO = join(process.cwd(), "public", "qualilab-logo-nobg.png");

let fallback: Promise<string | null> | null = null;

function fallbackLogo(): Promise<string | null> {
  fallback ??= readFile(FALLBACK_LOGO, "base64").then(
    (data) => `data:image/png;base64,${data}`,
    (error: unknown) => {
      console.error("[documents] logo file unreadable, cartouche printed without it", { error });
      fallback = null;
      return null;
    }
  );
  return fallback;
}

export async function documentLogo(company: CompanyInfo): Promise<string | null> {
  return company.logoData || fallbackLogo();
}
