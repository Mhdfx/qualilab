import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { criterionChange, validateCriteriaGrid, type CleanCriterion } from "@/lib/criteria-input";

/**
 * The whole criteria grid of a product type, saved in one transaction:
 * rows with an id are updated, rows without are created, rows absent from
 * the payload are deleted. Every save is audited with the grid before/after.
 * The administrator and the responsable des paramètres (16/10, Q125).
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiRole("PROGRAMMATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const type = await prisma.productType.findUnique({
    where: { id },
    select: { id: true, name: true, criteria: { select: { id: true, parameterId: true, normVersionId: true, n: true, c: true, mKind: true, m: true, bigM: true, unit: true, active: true } } },
  });
  if (!type) return NextResponse.json({ error: "Famille de produits introuvable." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  // Every row valid, one criterion per germ and norm version, at most
  // CRITERIA_GRID_MAX_ROWS — an imported family saves back as it is shown.
  const grid = validateCriteriaGrid((body as { criteria?: unknown } | null)?.criteria);
  if (!grid.ok) return NextResponse.json({ error: grid.error }, { status: 400 });
  const rows = grid.value;

  const parameterIds = [...new Set(rows.map((r) => r.parameterId))];
  const versionIds = [...new Set(rows.map((r) => r.normVersionId).filter((v): v is string => v !== null))];
  const [parameters, versions] = await Promise.all([
    prisma.analysisParameter.findMany({ where: { id: { in: parameterIds } }, select: { id: true } }),
    versionIds.length ? prisma.normVersion.findMany({ where: { id: { in: versionIds } }, select: { id: true } }) : Promise.resolve([]),
  ]);
  if (parameters.length !== parameterIds.length) return NextResponse.json({ error: "Un des paramètres n'existe pas." }, { status: 400 });
  if (versions.length !== versionIds.length) return NextResponse.json({ error: "Une des versions de norme n'existe pas." }, { status: 400 });

  const stored = new Map(type.criteria.map((c) => [c.id, c]));
  for (const row of rows) {
    if (row.id && !stored.has(row.id)) return NextResponse.json({ error: "Un critère ne fait pas partie de cette famille." }, { status: 400 });
  }
  const keep = new Set(rows.map((r) => r.id).filter((v): v is string => v !== null));
  // A row written only when it differs from the stored one: an imported grid
  // of several hundred rows saved for one cell writes one row, well within
  // the transaction's time.
  const changeOf = (row: CleanCriterion) => {
    const previous = row.id ? stored.get(row.id) : undefined;
    return previous ? criterionChange(previous, row) : "change";
  };
  const toWrite = rows.filter((row) => changeOf(row) !== "none");

  const saved = await prisma.$transaction(
    async (tx) => {
      await tx.criterion.deleteMany({ where: { productTypeId: id, id: { notIn: [...keep] } } });
      for (const row of toWrite) {
        const { id: rowId, ...data } = row;
        if (rowId) await tx.criterion.update({ where: { id: rowId }, data });
        else await tx.criterion.create({ data: { productTypeId: id, ...data } });
      }
      return tx.criterion.findMany({
        where: { productTypeId: id },
        select: { id: true, parameterId: true, normVersionId: true, unit: true, n: true, c: true, mKind: true, m: true, bigM: true, active: true, parameter: { select: { name: true } }, normVersion: { select: { label: true, current: true } } },
        orderBy: [{ parameter: { name: "asc" } }, { normVersion: { version: "desc" } }],
      });
    },
    // The first save of a large imported grid may tidy every row (`criterionChange`).
    { timeout: 30_000 }
  );

  await logAudit({
    actorId: session.id,
    action: "CRITERIA_UPDATED",
    entity: "ProductType",
    entityId: id,
    // Counts and the rows that actually moved — the whole grid would not fit
    // in the audit's TEXT column for a several-hundred-line type. A c the
    // import left where it means nothing, cleared, is counted apart
    // (`tidied`): no verdict changed, the grid is not « changed by hand ».
    metadata: {
      name: type.name,
      before: type.criteria.length,
      after: rows.length,
      changed: rows.filter((row) => changeOf(row) === "change").slice(0, 50),
      tidied: rows.filter((row) => changeOf(row) === "tidy").length,
      removed: type.criteria.filter((c) => !keep.has(c.id)).map((c) => c.id).slice(0, 50),
    },
  });

  return NextResponse.json({ criteria: saved });
}
