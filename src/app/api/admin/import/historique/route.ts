import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { loadLegacyImportFollowUp } from "@/lib/legacy-history-server";
import {
  MAX_FILE_CHARS,
  legacyResultRows,
  legacySampleRow,
  monthPlanWrites,
  planLegacyClientLinks,
  planLegacyMonth,
  readHistoryFile,
  readLegacyClients,
  summarizeMonthPlan,
  type ExistingLegacySample,
} from "@/lib/legacy-history-import";

/**
 * « Importer l'historique de l'ancien logiciel » (lot 5B, HA3 —
 * RETOUR-LABO-20-11.md §6), the administrator only, from the files that
 * `scripts/legacy/extract-legacy-history.py` writes. The decisions are the
 * pure plans of src/lib/legacy-history-import.ts; this route reads the
 * database and writes them.
 *
 *   POST { step: "clients", mode, text }  clients.csv — analyse: certain /
 *        ambiguous / not found; commit: writes the certain links only
 *        (LEGACY_HISTORY_CLIENTS_LINKED). An ambiguous client is decided
 *        by hand (PUT /api/admin/historique/liens).
 *   POST { step: "mois", mode, text }     one historique-AAAA-MM.ndjson —
 *        analyse: what would be written; commit: one transaction,
 *        createMany by 500, then journalled (LEGACY_HISTORY_IMPORTED: the
 *        file, its counts, the duration). Idempotent: the old software's ids
 *        and the line's hash — the same file again writes nothing.
 *   GET                                   the follow-up: samples per year,
 *        links, the months imported and their last run.
 *
 * Production runs the same route with the same files (they name clients:
 * they travel outside the repository, like the other legacy exports).
 */

const CHUNK = 500;
const RESULT_CHUNK = 1000;

type Step = "clients" | "mois";

export async function POST(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: { step?: unknown; mode?: unknown; text?: unknown; fileName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const step: Step | null = body.step === "clients" ? "clients" : body.step === "mois" ? "mois" : null;
  if (!step) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const mode = body.mode === "commit" ? "commit" : "analyse";
  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 120) : null;
  const text = typeof body.text === "string" ? body.text.replace(/^﻿/, "") : "";
  if (!text.trim()) {
    return NextResponse.json(
      { error: step === "clients" ? "Choisissez le fichier clients.csv de l'extraction." : "Choisissez un fichier mensuel « historique-AAAA-MM.ndjson »." },
      { status: 400 }
    );
  }
  if (text.length > MAX_FILE_CHARS) return NextResponse.json({ error: "Fichier trop volumineux (8 Mo maximum)." }, { status: 400 });

  return step === "clients" ? importClients(session.id, mode, text) : importMonth(session.id, mode, text, fileName);
}

// ---- step 1: the clients ------------------------------------------------------------------

async function importClients(actorId: string, mode: "analyse" | "commit", text: string) {
  const read = readLegacyClients(text);
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });
  if (read.rows.length + read.rejected.length === 0) return NextResponse.json({ error: "Le fichier ne contient aucun client." }, { status: 400 });

  const [clients, links] = await Promise.all([
    prisma.client.findMany({ select: { id: true, name: true, ice: true, archived: true, mergedIntoId: true } }),
    prisma.legacyClientLink.findMany({ select: { legacyClientId: true, clientId: true, matchedBy: true } }),
  ]);
  const plan = planLegacyClientLinks(read.rows, read.rejected, { clients, links });
  const { writes, ...summary } = plan;
  if (mode === "analyse") return NextResponse.json({ step: "clients", mode, ...summary });

  let written = 0;
  if (writes.length > 0) {
    try {
      written = await prisma.$transaction(
        async (tx) => {
          let count = 0;
          for (let i = 0; i < writes.length; i += CHUNK) {
            const result = await tx.legacyClientLink.createMany({
              data: writes.slice(i, i + CHUNK).map((w) => ({ ...w, createdById: actorId })),
              // A link made meanwhile (by hand, or a parallel run) is left as it is.
              skipDuplicates: true,
            });
            count += result.count;
          }
          return count;
        },
        { maxWait: 10_000, timeout: 60_000 }
      );
    } catch (error) {
      console.error("[import/historique] clients failed", error);
      return NextResponse.json({ error: "Le rattachement des clients n'a rien écrit (erreur pendant l'écriture). Relancez l'analyse." }, { status: 500 });
    }
  }
  await logAudit({
    actorId,
    action: "LEGACY_HISTORY_CLIENTS_LINKED",
    entity: "LegacyClientLink",
    entityId: null,
    metadata: { rows: plan.rows, counts: plan.counts, samples: plan.samples, written },
  });
  return NextResponse.json({ step: "clients", mode, ...summary, written });
}

// ---- step 2: a month ----------------------------------------------------------------------

async function importMonth(actorId: string, mode: "analyse" | "commit", text: string, fileName: string | null) {
  const started = Date.now();
  const file = readHistoryFile(text);
  if ("error" in file) return NextResponse.json({ error: file.error }, { status: 400 });

  const ids = file.lines.map((l) => (l.cancelled ? l.id : l.sample.id));
  const legacyClientIds = [...new Set(file.lines.flatMap((l) => (l.cancelled ? [] : [l.sample.legacyClientId])))];
  const legacySiteIds = [...new Set(file.lines.flatMap((l) => (!l.cancelled && l.sample.legacySiteId !== null ? [l.sample.legacySiteId] : [])))];
  const load = async () => {
    const [existing, links, sites] = await Promise.all([
      prisma.legacySample.findMany({ where: { id: { in: ids } }, select: { id: true, sourceHash: true, clientId: true, siteId: true, cancelled: true } }),
      prisma.legacyClientLink.findMany({ where: { legacyClientId: { in: legacyClientIds } }, select: { legacyClientId: true, clientId: true, siteId: true } }),
      prisma.site.findMany({ where: { legacyId: { in: legacySiteIds } }, select: { id: true, clientId: true, legacyId: true } }),
    ]);
    return planLegacyMonth(file, {
      existing: new Map<number, ExistingLegacySample>(existing.map((e) => [e.id, e])),
      links: new Map(links.map((l) => [l.legacyClientId, { clientId: l.clientId, siteId: l.siteId }])),
      sites: new Map(sites.flatMap((s) => (s.legacyId !== null ? [[s.legacyId, { id: s.id, clientId: s.clientId }] as const] : []))),
    });
  };
  const plan = await load();
  const summary = summarizeMonthPlan(plan);
  if (mode === "analyse") return NextResponse.json({ step: "mois", mode, fileName, ...summary });

  let written = { created: 0, rewritten: 0, hidden: 0, results: 0 };
  if (monthPlanWrites(plan)) {
    try {
      written = await prisma.$transaction(
        async (tx) => {
          const hidden = plan.hide.length > 0 ? (await tx.legacySample.updateMany({ where: { id: { in: plan.hide } }, data: { cancelled: true } })).count : 0;
          // A changed line is rewritten whole: its row and its analyses go, then come back as the file has them.
          const rewritten = plan.update.length > 0 ? (await tx.legacySample.deleteMany({ where: { id: { in: plan.update.map((s) => s.id) } } })).count : 0;
          const samples = [...plan.create, ...plan.update];
          let created = 0;
          for (let i = 0; i < samples.length; i += CHUNK) {
            created += (await tx.legacySample.createMany({ data: samples.slice(i, i + CHUNK).map(legacySampleRow), skipDuplicates: true })).count;
          }
          const results = legacyResultRows(samples);
          let resultCount = 0;
          for (let i = 0; i < results.length; i += RESULT_CHUNK) {
            resultCount += (await tx.legacyResult.createMany({ data: results.slice(i, i + RESULT_CHUNK), skipDuplicates: true })).count;
          }
          return { created: created - rewritten, rewritten, hidden, results: resultCount };
        },
        { maxWait: 10_000, timeout: 120_000 }
      );
    } catch (error) {
      console.error("[import/historique] month failed", { month: plan.header.month, error });
      return NextResponse.json(
        { error: "L'import de ce mois n'a rien écrit (erreur pendant l'écriture). Relancez l'analyse puis l'import." },
        { status: 500 }
      );
    }
  }
  const durationMs = Date.now() - started;
  // A run that writes nothing (the same file again) is journalled too: who ran it, when, with what result.
  await logAudit({
    actorId,
    action: "LEGACY_HISTORY_IMPORTED",
    entity: "LegacySample",
    entityId: null,
    metadata: {
      month: plan.header.month,
      part: plan.header.part,
      parts: plan.header.parts,
      fileName,
      extractedAt: plan.header.extractedAt,
      lines: plan.lines,
      counts: plan.counts,
      notLinkedClients: plan.notLinked.length,
      written,
      durationMs,
    },
  });
  return NextResponse.json({ step: "mois", mode, fileName, ...summary, written, durationMs });
}

// ---- the follow-up ------------------------------------------------------------------------

export async function GET() {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;
  return NextResponse.json(await loadLegacyImportFollowUp(), { headers: { "Cache-Control": "no-store" } });
}
