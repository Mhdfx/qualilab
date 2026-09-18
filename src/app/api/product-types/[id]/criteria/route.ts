import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateCriterion, type CleanCriterion } from "@/lib/criteria-input";

/**
 * The whole criteria grid of a product type, saved in one transaction:
 * rows with an id are updated, rows without are created, rows absent from
 * the payload are deleted. Every save is audited with the grid before/after.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const type = await prisma.productType.findUnique({
    where: { id },
    select: { id: true, name: true, criteria: { select: { id: true, parameterId: true, normVersionId: true, n: true, c: true, mKind: true, m: true, bigM: true, unit: true, active: true } } },
  });
  if (!type) return NextResponse.json({ error: "Type de produit introuvable." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const raw = (body as { criteria?: unknown } | null)?.criteria;
  if (!Array.isArray(raw)) return NextResponse.json({ error: "Aucun critère reçu." }, { status: 400 });
  if (raw.length > 200) return NextResponse.json({ error: "Trop de lignes (200 maximum)." }, { status: 400 });

  const rows: CleanCriterion[] = [];
  for (const [i, entry] of raw.entries()) {
    const checked = validateCriterion(entry, i + 1);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    rows.push(checked.value);
  }

  // One criterion per germ and per norm version: a duplicate pair would
  // make the bench's choice of criterion arbitrary.
  const pairs = new Set<string>();
  for (const [i, row] of rows.entries()) {
    const key = `${row.parameterId}|${row.normVersionId ?? ""}`;
    if (pairs.has(key)) {
      return NextResponse.json(
        { error: `Ligne ${i + 1} : ce germe a déjà un critère pour cette version de norme.` },
        { status: 400 }
      );
    }
    pairs.add(key);
  }

  const parameterIds = [...new Set(rows.map((r) => r.parameterId))];
  const versionIds = [...new Set(rows.map((r) => r.normVersionId).filter((v): v is string => v !== null))];
  const [parameters, versions] = await Promise.all([
    prisma.analysisParameter.findMany({ where: { id: { in: parameterIds } }, select: { id: true } }),
    versionIds.length ? prisma.normVersion.findMany({ where: { id: { in: versionIds } }, select: { id: true } }) : Promise.resolve([]),
  ]);
  if (parameters.length !== parameterIds.length) return NextResponse.json({ error: "Un des paramètres n'existe pas." }, { status: 400 });
  if (versions.length !== versionIds.length) return NextResponse.json({ error: "Une des versions de norme n'existe pas." }, { status: 400 });

  const known = new Set(type.criteria.map((c) => c.id));
  for (const row of rows) {
    if (row.id && !known.has(row.id)) return NextResponse.json({ error: "Un critère ne fait pas partie de ce type." }, { status: 400 });
  }
  const keep = new Set(rows.map((r) => r.id).filter((v): v is string => v !== null));

  const saved = await prisma.$transaction(async (tx) => {
    await tx.criterion.deleteMany({ where: { productTypeId: id, id: { notIn: [...keep] } } });
    for (const row of rows) {
      const { id: rowId, ...data } = row;
      if (rowId) await tx.criterion.update({ where: { id: rowId }, data });
      else await tx.criterion.create({ data: { productTypeId: id, ...data } });
    }
    return tx.criterion.findMany({
      where: { productTypeId: id },
      select: { id: true, parameterId: true, normVersionId: true, unit: true, n: true, c: true, mKind: true, m: true, bigM: true, active: true, parameter: { select: { name: true } }, normVersion: { select: { label: true, current: true } } },
      orderBy: [{ parameter: { name: "asc" } }, { normVersion: { version: "desc" } }],
    });
  });

  await logAudit({
    actorId: session.id,
    action: "CRITERIA_UPDATED",
    entity: "ProductType",
    entityId: id,
    // Counts and the rows that actually moved — the whole grid would not fit
    // in the audit's TEXT column for a 200-line type.
    metadata: {
      name: type.name,
      before: type.criteria.length,
      after: rows.length,
      changed: rows
        .filter((row) => {
          const previous = type.criteria.find((c) => c.id === row.id);
          return (
            !previous ||
            previous.parameterId !== row.parameterId ||
            previous.normVersionId !== row.normVersionId ||
            previous.n !== row.n ||
            previous.c !== row.c ||
            previous.mKind !== row.mKind ||
            previous.m !== row.m ||
            previous.bigM !== row.bigM ||
            previous.unit !== row.unit ||
            previous.active !== row.active
          );
        })
        .slice(0, 50),
      removed: type.criteria.filter((c) => !keep.has(c.id)).map((c) => c.id).slice(0, 50),
    },
  });

  return NextResponse.json({ criteria: saved });
}
