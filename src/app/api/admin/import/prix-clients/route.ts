import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";
import { detectDelimiter, parseCsv } from "@/lib/csv";
import {
  clientPriceColumns,
  planClientPriceImport,
  planWritesPrices,
  readClientPriceRows,
  type ClientPricePlan,
} from "@/lib/client-prices-import";
import { CLIENT_PRICE_OWN_BEFORE_SITE, CLIENT_PRICE_SKIP_LEGACY_TARIFF } from "@/lib/lab-proposals";

/**
 * « Importer les prix clients » (lot 4H, H5 — RETOUR-LABO-04-11.md §5): the
 * prices proper to some clients in the old software, from the CSV that
 * `scripts/legacy/extract-client-prices.py` writes. The decisions are made
 * by the pure `planClientPriceImport` (src/lib/client-prices-import.ts);
 * this route reads the database and writes the plan. The administrator only.
 *
 *   mode=analyse → what would be written (matched / client introuvable /
 *                  analyse introuvable / doublons), nothing written;
 *   mode=commit  → written in one transaction, then journalled
 *                  (CLIENT_PRICES_IMPORTED). Idempotent: `legacyPriceId`
 *                  and one price per client and analysis — re-running the
 *                  same file writes nothing; a price typed on a fiche is
 *                  never overwritten, a price removed on a fiche never
 *                  brought back (`removedAt`).
 *
 * The rules waiting for C-8 are the switches `CLIENT_PRICE_SKIP_LEGACY_TARIFF`
 * and `CLIENT_PRICE_OWN_BEFORE_SITE` (lab-proposals.ts).
 *
 * Production runs the same route with the same file (the CSV holds client
 * names: it travels outside the repository, like the other legacy exports).
 */

const MAX_CSV_CHARS = 8 * 1024 * 1024;
const CHUNK = 500;

/** What the screen shows: the plan without its list of writes. */
function summarize(plan: ClientPricePlan) {
  const { writes, ...summary } = plan;
  void writes;
  return summary;
}

export async function POST(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: { csv?: unknown; mode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const mode = body.mode === "commit" ? "commit" : "analyse";

  // ---- the file ----------------------------------------------------------------------
  const csv = typeof body.csv === "string" ? body.csv.replace(/^﻿/, "") : "";
  if (!csv.trim()) return NextResponse.json({ error: "Choisissez le fichier des prix clients exporté de l'ancien logiciel." }, { status: 400 });
  if (csv.length > MAX_CSV_CHARS) return NextResponse.json({ error: "Fichier trop volumineux (8 Mo maximum)." }, { status: 400 });
  const table = parseCsv(csv, detectDelimiter(csv));
  const columns = clientPriceColumns(table[0] ?? []);
  if (!columns) {
    return NextResponse.json(
      { error: "Colonnes introuvables : la première ligne doit nommer au moins « legacyPriceId », « legacyClientId », « client », « parametre » et « prix »." },
      { status: 400 }
    );
  }
  const { rows, rejected } = readClientPriceRows(table.slice(1), columns);
  if (rows.length + rejected.length === 0) return NextResponse.json({ error: "Le fichier ne contient aucun prix." }, { status: 400 });

  // ---- what the database already knows ------------------------------------------------
  const load = async () => {
    const [clients, sites, parameters, natures, existing] = await Promise.all([
      prisma.client.findMany({ select: { id: true, name: true, ice: true, archived: true, mergedIntoId: true } }),
      prisma.site.findMany({ where: { legacyId: { not: null } }, select: { legacyId: true, clientId: true, billingClientId: true } }),
      prisma.analysisParameter.findMany({ select: { id: true, name: true, aliases: true, category: true, family: true } }),
      prisma.analysisNature.findMany({ select: { legacyId: true, legacyType: true, family: true } }),
      prisma.clientPrice.findMany({
        where: { parameterId: { not: null } },
        select: { id: true, clientId: true, itemKey: true, unitPrice: true, origin: true, legacyPriceId: true, removedAt: true },
      }),
    ]);
    return planClientPriceImport(rows, rejected, {
      clients,
      sites,
      parameters,
      natures: natures.map((n) => ({ legacyId: n.legacyId, category: n.legacyType, family: n.family })),
      existing: existing.map((e) => ({ ...e, unitPrice: toMoney(e.unitPrice) })),
    }, { skipLegacyTariff: CLIENT_PRICE_SKIP_LEGACY_TARIFF, ownBeforeSite: CLIENT_PRICE_OWN_BEFORE_SITE });
  };
  const plan = await load();
  if (mode === "analyse") return NextResponse.json({ mode, ...summarize(plan) });

  // ---- commit: all or nothing --------------------------------------------------------
  const created = plan.writes.filter((w) => w.existingId === null);
  const updated = plan.writes.filter((w) => w.existingId !== null);
  let written: { created: number; updated: number } = { created: 0, updated: 0 };
  // A run that writes nothing (the same file again) is journalled too: who ran the reprise, when, with what result.
  try {
    if (planWritesPrices(plan)) written = await prisma.$transaction(
      async (tx) => {
        let createdCount = 0;
        for (let i = 0; i < created.length; i += CHUNK) {
          const result = await tx.clientPrice.createMany({
            data: created.slice(i, i + CHUNK).map((w) => ({
              clientId: w.clientId,
              parameterId: w.parameterId,
              itemKey: w.itemKey,
              unitPrice: w.unitPrice,
              origin: "REPRISE" as const,
              legacyPriceId: w.legacyPriceId,
              legacyClientId: w.legacyClientId,
              legacyModifiedAt: w.legacyModifiedAt,
            })),
            // A parallel run, or a price typed meanwhile on the same fiche: left as it is.
            skipDuplicates: true,
          });
          createdCount += result.count;
        }
        let updatedCount = 0;
        for (const w of updated) {
          // Never over a price typed on the fiche, nor removed there, since the analysis.
          const result = await tx.clientPrice.updateMany({
            where: { id: w.existingId!, origin: "REPRISE", removedAt: null },
            data: {
              unitPrice: w.unitPrice,
              legacyPriceId: w.legacyPriceId,
              legacyClientId: w.legacyClientId,
              legacyModifiedAt: w.legacyModifiedAt,
            },
          });
          updatedCount += result.count;
        }
        return { created: createdCount, updated: updatedCount };
      },
      { maxWait: 10_000, timeout: 120_000 }
    );
  } catch (error) {
    console.error("[import/prix-clients] failed", error);
    return NextResponse.json(
      { error: "L'import des prix n'a rien écrit (erreur pendant l'écriture). Relancez l'analyse puis l'import." },
      { status: 500 }
    );
  }

  await logAudit({
    actorId: session.id,
    action: "CLIENT_PRICES_IMPORTED",
    entity: "ClientPrice",
    entityId: null,
    metadata: {
      rows: plan.rows,
      counts: plan.counts,
      matched: plan.matched,
      conflicts: plan.conflicts,
      legacyTariff: plan.legacyTariff,
      clients: plan.clients,
      written,
    },
  });
  return NextResponse.json({ mode, ...summarize(plan), written });
}
