import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { detectDelimiter, parseCsv } from "@/lib/csv";
import {
  clientMatcher,
  groupLabels,
  guessMemoryColumns,
  readMemoryRows,
  type MemoryEntry,
} from "@/lib/memory-import";

/**
 * Loading the client memory in one go (RETOUR-LABO-29-09.md, slice A) —
 * the designations and places the corrector compares against.
 *
 *   source=samples → from the samples already in the database;
 *   source=csv     → from a file exported from the old software.
 *   mode=analyse   → what would be added, nothing written;
 *   mode=commit    → written, idempotent: a known label keeps the larger of
 *                    its usage counts, so re-running changes nothing.
 */

const MAX_CSV_CHARS = 20 * 1024 * 1024;

type Grouped = Map<string, { products: string[]; places: string[] }>;

export async function POST(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: { source?: unknown; csv?: unknown; mode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const source = body.source === "csv" ? "csv" : "samples";
  const mode = body.mode === "commit" ? "commit" : "analyse";

  // ---- the rows, per client ---------------------------------------------------
  const grouped: Grouped = new Map();
  const add = (clientId: string, designation: string, lieu: string) => {
    const entry = grouped.get(clientId) ?? { products: [], places: [] };
    if (designation) entry.products.push(designation);
    if (lieu) entry.places.push(lieu);
    grouped.set(clientId, entry);
  };
  const unmatched = new Map<string, number>();
  let rowCount = 0;

  if (source === "samples") {
    const samples = await prisma.sample.findMany({
      where: { status: { not: "ANNULE" } },
      select: { clientId: true, produit: true, lieu: true, lineKind: true },
    });
    for (const s of samples) {
      rowCount += 1;
      // A surface or a pair of hands is not a product designation.
      const designation = s.lineKind === "SURFACE" || s.lineKind === "MAINS" ? "" : (s.produit ?? "").trim();
      add(s.clientId, designation, (s.lieu ?? "").trim());
    }
  } else {
    const csv = typeof body.csv === "string" ? body.csv.replace(/^﻿/, "") : "";
    if (!csv.trim()) return NextResponse.json({ error: "Collez ou choisissez le fichier de l'ancien logiciel." }, { status: 400 });
    if (csv.length > MAX_CSV_CHARS) return NextResponse.json({ error: "Fichier trop volumineux (20 Mo maximum)." }, { status: 400 });
    const table = parseCsv(csv, detectDelimiter(csv));
    const columns = guessMemoryColumns(table[0] ?? []);
    if (!columns) {
      return NextResponse.json(
        { error: "Colonnes introuvables : la première ligne doit nommer au moins « Client » et « Désignation » (ou « NOM_PRODUIT »)." },
        { status: 400 }
      );
    }
    const clients = await prisma.client.findMany({ select: { id: true, name: true, ice: true } });
    const match = clientMatcher(clients);
    for (const row of readMemoryRows(table.slice(1), columns)) {
      rowCount += 1;
      const clientId = match(row.client);
      if (!clientId) {
        unmatched.set(row.client, (unmatched.get(row.client) ?? 0) + 1);
        continue;
      }
      add(clientId, row.designation, row.lieu);
    }
  }

  // ---- compare with what is already known ---------------------------------------
  const clientIds = [...grouped.keys()];
  const [knownProducts, knownPlaces] = await Promise.all([
    prisma.clientProduct.findMany({
      where: { clientId: { in: clientIds } },
      select: { id: true, clientId: true, normalizedLabel: true, usageCount: true },
    }),
    prisma.clientPlace.findMany({
      where: { clientId: { in: clientIds } },
      select: { id: true, clientId: true, siteId: true, normalizedLabel: true, usageCount: true },
    }),
  ]);
  const productKey = (c: string, n: string) => `${c}|${n}`;
  const productByKey = new Map(knownProducts.map((p) => [productKey(p.clientId, p.normalizedLabel), p]));
  // A place is known for the client when it exists without a site, or on any site.
  const placeByKey = new Map<string, (typeof knownPlaces)[number]>();
  for (const p of knownPlaces) {
    const key = productKey(p.clientId, p.normalizedLabel);
    if (!placeByKey.has(key) || p.siteId === null) placeByKey.set(key, p);
  }

  const plan: { clientId: string; products: MemoryEntry[]; places: MemoryEntry[] }[] = [];
  let newProducts = 0;
  let newPlaces = 0;
  for (const [clientId, rows] of grouped) {
    const products = groupLabels(rows.products);
    const places = groupLabels(rows.places);
    newProducts += products.filter((p) => !productByKey.has(productKey(clientId, p.normalizedLabel))).length;
    newPlaces += places.filter((p) => !placeByKey.has(productKey(clientId, p.normalizedLabel))).length;
    plan.push({ clientId, products, places });
  }

  const summary = {
    source,
    rows: rowCount,
    clients: grouped.size,
    unmatched: [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50).map(([client, count]) => ({ client, count })),
    unmatchedCount: unmatched.size,
    products: { total: plan.reduce((n, c) => n + c.products.length, 0), new: newProducts },
    places: { total: plan.reduce((n, c) => n + c.places.length, 0), new: newPlaces },
  };
  if (mode === "analyse") return NextResponse.json({ mode, ...summary });

  // ---- commit, client by client ----------------------------------------------
  try {
    for (const client of plan) {
      await prisma.$transaction(async (tx) => {
        const fresh = client.products.filter((p) => !productByKey.has(productKey(client.clientId, p.normalizedLabel)));
        if (fresh.length > 0) {
          await tx.clientProduct.createMany({
            data: fresh.map((p) => ({ clientId: client.clientId, label: p.label, normalizedLabel: p.normalizedLabel, usageCount: p.count })),
            skipDuplicates: true,
          });
        }
        for (const p of client.products) {
          const known = productByKey.get(productKey(client.clientId, p.normalizedLabel));
          if (known && known.usageCount < p.count) {
            await tx.clientProduct.update({ where: { id: known.id }, data: { usageCount: p.count, active: true } });
          }
        }
        for (const p of client.places) {
          const known = placeByKey.get(productKey(client.clientId, p.normalizedLabel));
          if (!known) {
            await tx.clientPlace.create({
              data: { clientId: client.clientId, siteId: null, label: p.label, normalizedLabel: p.normalizedLabel, usageCount: p.count },
            });
          } else if (known.usageCount < p.count) {
            await tx.clientPlace.update({ where: { id: known.id }, data: { usageCount: p.count, active: true } });
          }
        }
      });
    }
  } catch (error) {
    console.error("[import/memoire] failed", { error });
    return NextResponse.json({ error: "L'import a échoué en cours de route ; relancez-le, il reprendra sans doublon." }, { status: 500 });
  }

  await logAudit({
    actorId: session.id,
    action: "CLIENT_MEMORY_IMPORTED",
    entity: "Client",
    entityId: null,
    metadata: { source, rows: rowCount, clients: grouped.size, newProducts, newPlaces, unmatched: unmatched.size },
  });

  return NextResponse.json({ mode, ...summary });
}
