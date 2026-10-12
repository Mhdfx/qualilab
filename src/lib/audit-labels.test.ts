import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACTION_LABELS, actionChoices, actionLabel } from "./audit-labels";

/**
 * Every action the application journals reads in French on /admin/journal
 * and can be picked in its « Action » filter. This reads the sources: each
 * code written by `logAudit({ action: … })` — a literal, or either branch of
 * a ternary — must have its label.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" ? [] : walk(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

/** The codes after `action:` up to the end of that property (ternaries included). */
function journalledCodes(source: string): string[] {
  const codes: string[] = [];
  for (const match of source.matchAll(/\baction:/g)) {
    const rest = source.slice(match.index + "action:".length);
    const end = rest.search(/,\s*\n|\n\s*\}/);
    const property = end < 0 ? rest : rest.slice(0, end);
    for (const literal of property.matchAll(/(?:^|\?|:)\s*"([A-Z][A-Z0-9_]+)"/g)) codes.push(literal[1]);
  }
  return codes;
}

const files = walk(SRC)
  .map((path) => ({ rel: relative(SRC, path).split(sep).join("/"), source: readFileSync(path, "utf8") }))
  .filter((file) => file.source.includes("logAudit("));

describe("journal labels", () => {
  it("finds the journalling call sites", () => {
    expect(files.length).toBeGreaterThan(40);
    const all = files.flatMap((file) => journalledCodes(file.source));
    expect(all).toContain("SAMPLE_RECEIVED");
    // Both branches of a ternary are read.
    expect(all).toContain("USER_DISABLED");
    expect(all).toContain("USER_ENABLED");
  });

  it("labels every code written by logAudit()", () => {
    const missing = files.flatMap((file) =>
      journalledCodes(file.source)
        .filter((code) => !Object.prototype.hasOwnProperty.call(ACTION_LABELS, code))
        .map((code) => `${code} (${file.rel}) — add its label to src/lib/audit-labels.ts`)
    );
    expect(missing).toEqual([]);
  });

  it("labels every AUDIT_ACTIONS constant", () => {
    // Read from the source: audit.ts imports the database client.
    const source = readFileSync(join(SRC, "lib", "audit.ts"), "utf8");
    const constants = [...source.matchAll(/^\s+([A-Z][A-Z0-9_]+): "\1",$/gm)].map((match) => match[1]);
    expect(constants).toContain("INVOICE_ISSUED");
    for (const code of constants) expect(ACTION_LABELS[code], code).toBeTruthy();
  });

  it("labels the codes of the gaps build (reception, accord du client, export)", () => {
    expect(ACTION_LABELS.CLIENT_CONSULTED).toBe("Accord du client enregistré");
    expect(ACTION_LABELS.SAMPLE_AWAITING_CLIENT).toBe("Échantillon en attente de l'avis du client");
    expect(ACTION_LABELS.SERIE_PHOTO_VIEWED).toBe("Photo du protocole signé consultée");
    expect(ACTION_LABELS.INVOICES_EXPORTED).toBe("Export du journal des ventes");
  });

  it("offers each action once, under a wording no other action shares", () => {
    const choices = actionChoices();
    expect(choices.length).toBe(Object.keys(ACTION_LABELS).length);
    const labels = choices.map((choice) => choice.label);
    expect(new Set(labels).size).toBe(labels.length);
    const sorted = [...labels].sort((a, b) => a.localeCompare(b, "fr"));
    expect(labels).toEqual(sorted);
  });

  it("prints an unknown code as written", () => {
    expect(actionLabel("SAMPLE_RECEIVED")).toBe("Échantillon réceptionné");
    expect(actionLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(actionLabel("toString")).toBe("toString");
  });
});
