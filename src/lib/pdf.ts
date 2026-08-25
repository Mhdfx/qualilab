import { chromium, type Browser } from "playwright-core";

/**
 * HTML → PDF, rendered by a real browser.
 *
 * The official report has to be typographically exact and may run to several
 * pages, so it is rendered by Chromium rather than drawn by hand: the text
 * stays selectable, the layout matches what we design in HTML, and the page
 * breaks are the browser's.
 *
 * We use `playwright-core` and drive a browser that is already on the machine
 * instead of bundling one — a Chromium download per environment would be
 * ~150 MB on a small VPS for no gain. Set `CHROMIUM_PATH` when the executable
 * is somewhere unusual.
 */

const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  // Linux (VPS): apt install chromium
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  // Windows (development)
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean) as string[];

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  // One browser for the whole process: launching costs a few hundred
  // milliseconds, and a report should feel instant.
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing?.isConnected()) return existing;
    browserPromise = null;
  }

  const { existsSync } = await import("node:fs");
  const executablePath = CANDIDATES.find((candidate) => existsSync(candidate));

  if (!executablePath) {
    throw new Error(
      "Aucun navigateur trouvé pour générer le PDF. Installez Chromium et/ou définissez CHROMIUM_PATH."
    );
  }

  browserPromise = chromium.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  return browserPromise;
}

export async function renderPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });
  } finally {
    await page.close();
  }
}
