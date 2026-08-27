import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { parseCsv } from "@/lib/csv";
import {
  CLIENT_IMPORT_FIELDS,
  guessMapping,
  validateImport,
  type ImportMapping,
} from "@/lib/client-import";

/**
 * Legacy client import (NEEDEDINFO item 7) — three phases, one endpoint:
 *
 *  no `mapping`          → analyse: detected columns + a guessed mapping.
 *  `mapping`, no commit  → dry-run: what WOULD happen, row by row.
 *  `mapping` + `commit`  → the import itself, in one transaction.
 *
 * Nothing touches the database before commit, and a commit only creates —
 * existing clients are reported as duplicates, never overwritten: historical
 * data deserves a look, not a merge heuristic.
 */

const MAX_CSV_CHARS = 2_000_000; // ~2 MB of text
const MAX_ROWS = 2_000;
const PREVIEW_ROWS = 5;

export async function POST(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { csv, mapping, hasHeader, commit } = (body ?? {}) as {
    csv?: unknown;
    mapping?: unknown;
    hasHeader?: unknown;
    commit?: unknown;
  };

  if (typeof csv !== "string" || !csv.trim()) {
    return NextResponse.json(
      { error: "Aucun contenu à importer." },
      { status: 400 }
    );
  }
  if (csv.length > MAX_CSV_CHARS) {
    return NextResponse.json(
      { error: "Fichier trop volumineux (2 Mo maximum). Découpez-le." },
      { status: 400 }
    );
  }

  const rows = parseCsv(csv);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Le fichier ne contient aucune ligne lisible." },
      { status: 400 }
    );
  }
  if (rows.length > MAX_ROWS + 1) {
    return NextResponse.json(
      { error: `Trop de lignes (${rows.length}) — ${MAX_ROWS} maximum par fichier.` },
      { status: 400 }
    );
  }

  // ---- Phase 1 · analyse: no mapping yet — propose one.
  if (mapping === undefined) {
    return NextResponse.json({
      columns: rows[0],
      guess: guessMapping(rows[0]),
      rowCount: rows.length,
      preview: rows.slice(0, PREVIEW_ROWS + 1),
    });
  }

  if (
    !Array.isArray(mapping) ||
    !mapping.every(
      (field) =>
        field === "" ||
        (CLIENT_IMPORT_FIELDS as readonly string[]).includes(field as string)
    )
  ) {
    return NextResponse.json({ error: "Correspondance invalide." }, { status: 400 });
  }
  if (!mapping.includes("name")) {
    return NextResponse.json(
      { error: "Associez au moins la colonne « Raison sociale »." },
      { status: 400 }
    );
  }

  const withHeader = hasHeader !== false;
  const validation = validateImport(rows, mapping as ImportMapping, withHeader);

  // Rows that collide with clients already in the database.
  const names = validation.valid.map((row) => row.value.name);
  const ices = validation.valid
    .map((row) => row.value.ice)
    .filter((ice): ice is string => !!ice);
  const existing = await prisma.client.findMany({
    where: {
      OR: [
        { name: { in: names } },
        ...(ices.length > 0 ? [{ ice: { in: ices } }] : []),
      ],
    },
    select: { name: true, ice: true },
  });
  const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));
  const existingIces = new Set(existing.map((c) => c.ice).filter(Boolean));

  const toCreate = validation.valid.filter(
    (row) =>
      !existingNames.has(row.value.name.toLowerCase()) &&
      !(row.value.ice && existingIces.has(row.value.ice))
  );
  const alreadyKnown = validation.valid
    .filter((row) => !toCreate.includes(row))
    .map((row) => ({
      line: row.line,
      error: `« ${row.value.name} » existe déjà — ignoré.`,
    }));

  const report = {
    rowCount: rows.length - (withHeader ? 1 : 0),
    toCreate: toCreate.length,
    created: 0,
    invalid: validation.invalid,
    duplicates: [...validation.duplicatesInFile, ...alreadyKnown],
    preview: toCreate.slice(0, PREVIEW_ROWS).map((row) => row.value),
  };

  // ---- Phase 2 · dry-run.
  if (commit !== true) {
    return NextResponse.json(report);
  }

  // ---- Phase 3 · commit.
  if (toCreate.length === 0) {
    return NextResponse.json(
      { error: "Aucun client à créer — corrigez le fichier ou la correspondance." },
      { status: 400 }
    );
  }

  await prisma.$transaction(
    toCreate.map((row) =>
      prisma.client.create({
        data: {
          ...row.value,
          // The email column doubles as the first recipient address, so an
          // imported client can receive reports without a second data entry.
          ...(row.value.email
            ? {
                emails: {
                  create: {
                    email: row.value.email.toLowerCase(),
                    forReports: true,
                    forAlerts: true,
                  },
                },
              }
            : {}),
        },
      })
    )
  );

  await logAudit({
    actorId: session.id,
    action: "CLIENTS_IMPORTED",
    entity: "Client",
    entityId: "import",
    metadata: {
      created: toCreate.length,
      invalid: validation.invalid.length,
      duplicates: report.duplicates.length,
    },
  });

  return NextResponse.json({ ...report, created: toCreate.length });
}
