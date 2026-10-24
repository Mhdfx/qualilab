import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isLockConflict } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import {
  CRITERIA_GRID_BUSY_ERROR,
  CRITERIA_GRID_STALE_ERROR,
  criteriaGridVersion,
  criterionChange,
  validateCriteriaGrid,
  type CleanCriterion,
} from "@/lib/criteria-input";

/**
 * The whole criteria grid of a product type, saved in one transaction:
 * rows with an id are updated, rows without are created, rows absent from
 * the payload are deleted. Every save is audited with the grid before/after.
 * The administrator and the responsable des paramètres (16/10, Q125).
 *
 * `version` (`criteriaGridVersion` of the rows the grid loaded) is compared
 * under the rows' lock: a grid opened before « Scinder par domaine », another
 * tab's save or the reprise gets 409 and writes nothing — it would otherwise
 * turn the split's rows on again on the source. The grid always sends it; a
 * script that sends none is not checked (as `checkParameterVersion`).
 */

const CRITERION_SELECT = { id: true, parameterId: true, normVersionId: true, n: true, c: true, mKind: true, m: true, bigM: true, unit: true, active: true, updatedAt: true } as const;

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiRole("PROGRAMMATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;
  const { id } = await params;

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
  const version = (body as { version?: unknown }).version;
  if (version !== undefined && version !== null && (typeof version !== "string" || version.length > 64)) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const parameterIds = [...new Set(rows.map((r) => r.parameterId))];
  const versionIds = [...new Set(rows.map((r) => r.normVersionId).filter((v): v is string => v !== null))];
  const [parameters, versions] = await Promise.all([
    prisma.analysisParameter.findMany({ where: { id: { in: parameterIds } }, select: { id: true } }),
    versionIds.length ? prisma.normVersion.findMany({ where: { id: { in: versionIds } }, select: { id: true } }) : Promise.resolve([]),
  ]);
  if (parameters.length !== parameterIds.length) return NextResponse.json({ error: "Un des paramètres n'existe pas." }, { status: 400 });
  if (versions.length !== versionIds.length) return NextResponse.json({ error: "Une des versions de norme n'existe pas." }, { status: 400 });

  let outcome;
  try {
    outcome = await prisma.$transaction(
      async (tx) => {
        // The family, then its rows, held until the commit — the order of
        // « Scinder par domaine »: a split, another save of this grid or the
        // reprise waits, then this one reads what it committed. The read
        // below is the transaction's first plain read, after the locks.
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT \`id\` FROM \`ProductType\` WHERE \`id\` = ${id} FOR UPDATE`;
        if (locked.length === 0) return { kind: "missing" as const };
        await tx.$queryRaw`SELECT \`id\` FROM \`Criterion\` WHERE \`productTypeId\` = ${id} FOR UPDATE`;
        const type = await tx.productType.findUnique({ where: { id }, select: { name: true, criteria: { select: CRITERION_SELECT } } });
        if (!type) return { kind: "missing" as const };
        if (typeof version === "string" && version !== criteriaGridVersion(type.criteria)) return { kind: "stale" as const };

        const stored = new Map(type.criteria.map((c) => [c.id, c]));
        if (rows.some((row) => row.id && !stored.has(row.id))) return { kind: "foreign" as const };
        const keep = new Set(rows.map((r) => r.id).filter((v): v is string => v !== null));
        // A row written only when it differs from the stored one: an imported grid
        // of several hundred rows saved for one cell writes one row, well within
        // the transaction's time.
        const changeOf = (row: CleanCriterion) => {
          const previous = row.id ? stored.get(row.id) : undefined;
          return previous ? criterionChange(previous, row) : "change";
        };
        const toWrite = rows.filter((row) => changeOf(row) !== "none");

        await tx.criterion.deleteMany({ where: { productTypeId: id, id: { notIn: [...keep] } } });
        for (const row of toWrite) {
          const { id: rowId, ...data } = row;
          if (rowId) await tx.criterion.update({ where: { id: rowId }, data });
          else await tx.criterion.create({ data: { productTypeId: id, ...data } });
        }
        const saved = await tx.criterion.findMany({
          where: { productTypeId: id },
          select: { ...CRITERION_SELECT, parameter: { select: { name: true } }, normVersion: { select: { label: true, current: true } } },
          orderBy: [{ parameter: { name: "asc" } }, { normVersion: { version: "desc" } }],
        });
        return {
          kind: "saved" as const,
          saved,
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
        };
      },
      // The first save of a large imported grid may tidy every row (`criterionChange`).
      { timeout: 30_000 }
    );
  } catch (error) {
    // A lock lost to another write of this family (a split, another save):
    // the transaction is rolled back, nothing was written.
    if (isLockConflict(error)) return NextResponse.json({ error: CRITERIA_GRID_BUSY_ERROR }, { status: 409 });
    throw error;
  }

  if (outcome.kind === "missing") return NextResponse.json({ error: "Famille de produits introuvable." }, { status: 404 });
  if (outcome.kind === "stale") return NextResponse.json({ error: CRITERIA_GRID_STALE_ERROR }, { status: 409 });
  if (outcome.kind === "foreign") return NextResponse.json({ error: "Un critère ne fait pas partie de cette famille." }, { status: 400 });

  await logAudit({ actorId: session.id, action: "CRITERIA_UPDATED", entity: "ProductType", entityId: id, metadata: outcome.metadata });

  return NextResponse.json({ criteria: outcome.saved });
}
