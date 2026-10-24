import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import type { Family, SampleStatus } from "@/generated/prisma/enums";
import { requireApiRole } from "@/lib/auth";
import { isLockConflict } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { CORRECTABLE_STATUSES } from "@/lib/sample-status";
import { normalizeLabel } from "@/lib/serie-input";
import {
  SPLIT_BUSY_ERROR,
  SPLIT_DOMAINS,
  copiedCriterion,
  decideSplit,
  planFamilySplit,
  splitJournal,
  splitNameCheck,
  validateSplitRequest,
  type SplitBlockingSample,
  type SplitCriterion,
  type SplitPreview,
  type SplitSample,
  type SplitSource,
} from "@/lib/family-split";

/**
 * « Scinder par domaine » — one famille de produits split in two by the
 * domain of its criteria' parameters (`src/lib/family-split.ts`, the
 * report of 23/10 « voie B »). Administrator only.
 *
 *   GET  → the preview (`planFamilySplit`): for the other of the two
 *          domains (microbiology / physico-chemistry), its active rows and
 *          germs, the name and the type d'analyse proposed, the
 *          near-identical names, what forbids it now, and two warnings — the
 *          validated reports an amendment would read without criterion, the
 *          open samples of that domain left under the source. Writes nothing.
 *   POST `{ domain, name, natureId, version, confirmSimilar? }` → all or
 *          nothing, in one transaction: the new family (same client, same
 *          regulation, same activity, the type d'analyse chosen), the
 *          active rows of that domain copied into it then deactivated on
 *          the source (never deleted), three journal entries. 409, nothing
 *          written, when the family changed since the preview (`version`),
 *          when nothing qualifies, when the domain is the family's own, when
 *          open samples would lose criteria (listed), when the name is
 *          taken, or near-identical and not confirmed.
 */

type Db = Prisma.TransactionClient;

const NATURE_SELECT = { id: true, code: true, label: true, family: true, legacyType: true, active: true, sortOrder: true } as const;

/** A validated report — « Rouvrir pour amendement » sends it back to the bench. */
const CLOSED_STATUSES: SampleStatus[] = ["VALIDE", "RAPPORT_ENVOYE"];

/** The family, its criteria, the natures, its open samples concerned and its validated reports carrying a leaving germ. */
async function loadSplit(db: Db, id: string) {
  const type = await db.productType.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      clientId: true,
      regulationId: true,
      active: true,
      nature: { select: NATURE_SELECT },
      criteria: {
        select: {
          id: true,
          parameterId: true,
          normVersionId: true,
          unit: true,
          n: true,
          c: true,
          mKind: true,
          m: true,
          bigM: true,
          active: true,
          parameter: { select: { name: true, family: true, category: true } },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!type) return null;

  const source: SplitSource = {
    id: type.id,
    name: type.name,
    clientId: type.clientId,
    regulationId: type.regulationId,
    active: type.active,
    nature: type.nature,
  };
  const criteria: SplitCriterion[] = type.criteria.map((row) => ({
    id: row.id,
    parameterId: row.parameterId,
    parameterName: row.parameter.name,
    parameterFamily: row.parameter.family,
    parameterCategory: row.parameter.category,
    normVersionId: row.normVersionId,
    unit: row.unit,
    n: row.n,
    c: row.c,
    mKind: row.mKind,
    m: row.m,
    bigM: row.bigM,
    active: row.active,
  }));

  // Only the germs that could leave: the active rows of the other of the two
  // domains (never « Autres analyses », `SPLIT_DOMAINS`).
  const domain = type.nature?.family ?? null;
  const others = SPLIT_DOMAINS.filter((candidate) => candidate !== domain);
  const leaving = [...new Set(criteria.filter((row) => row.active && others.includes(row.parameterFamily)).map((row) => row.parameterId))];
  const nothingLeaves = leaving.length === 0 || domain === null;
  const sampleSelect = {
    id: true,
    code: true,
    controlCode: true,
    status: true,
    nature: { select: { family: true } },
    results: { where: { parameterId: { in: leaving } }, select: { parameterId: true } },
  } as const;
  const [natures, open, closed] = await Promise.all([
    db.analysisNature.findMany({ select: NATURE_SELECT, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    // Open: those carrying a leaving germ (they block), and those whose type
    // d'analyse is of a leaving domain (they stay under the source: a warning).
    nothingLeaves
      ? Promise.resolve([])
      : db.sample.findMany({
          where: {
            productTypeId: id,
            status: { in: CORRECTABLE_STATUSES },
            OR: [
              { parameters: { some: { parameterId: { in: leaving } } } },
              { results: { some: { parameterId: { in: leaving } } } },
              { nature: { family: { in: others } } },
            ],
          },
          select: { ...sampleSelect, parameters: { where: { parameterId: { in: leaving } }, select: { parameterId: true } } },
        }),
    // Validated reports with a result of a leaving germ: an amendment would
    // read them live again, without criterion (a warning).
    nothingLeaves
      ? Promise.resolve([])
      : db.sample.findMany({
          where: { productTypeId: id, status: { in: CLOSED_STATUSES }, results: { some: { parameterId: { in: leaving } } } },
          select: sampleSelect,
        }),
  ]);

  const toSplitSample = (sample: {
    id: string;
    code: string;
    controlCode: string | null;
    status: SampleStatus;
    nature: { family: Family };
    results: { parameterId: string }[];
    parameters?: { parameterId: string }[];
  }): SplitSample => ({
    id: sample.id,
    reference: sample.controlCode ?? sample.code,
    status: sample.status,
    natureFamily: sample.nature.family,
    parameterIds: [...new Set([...(sample.parameters ?? []), ...sample.results].map((row) => row.parameterId))],
  });

  return { source, criteria, natures, samples: open.map(toSplitSample), closedSamples: closed.map(toSplitSample) };
}


/** The families a new name is compared with: the common ones and the client's. */
function nameCandidates(db: Db, clientId: string | null) {
  return db.productType.findMany({
    where: { OR: [{ clientId: null }, ...(clientId ? [{ clientId }] : [])] },
    select: { id: true, name: true, normalizedName: true, clientId: true },
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const loaded = await loadSplit(prisma, id);
  if (!loaded) return NextResponse.json({ error: "Famille de produits introuvable." }, { status: 404 });
  const preview = planFamilySplit(loaded);
  const families = preview.groups.length > 0 ? await nameCandidates(prisma, loaded.source.clientId) : [];

  return NextResponse.json({
    ...preview,
    groups: preview.groups.map((group) => ({
      ...group,
      // The proposed name against the catalogue: the dialog says it before the confirmation does.
      name: splitNameCheck(group.proposedName, loaded.source.clientId, families, id),
    })),
  });
}

/** A refusal decided inside the transaction, before anything was written. */
type Refused = {
  kind: "refused";
  status: 400 | 404 | 409;
  error: string;
  blockingSamples?: SplitBlockingSample[];
  similar?: string[];
  preview?: SplitPreview;
};
type Done = {
  kind: "done";
  id: string;
  name: string;
  moved: number;
  sourceActiveBefore: number;
  sourceActiveAfter: number;
};

/** A row moved under the locks: cannot happen, rolls everything back if it does. */
class SplitConflict extends Error {}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const checked = validateSplitRequest(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const ask = checked.value;

  let outcome: Refused | Done;
  try {
    outcome = await prisma.$transaction(
      async (tx): Promise<Refused | Done> => {
        // Its samples first (programme / intake lock Sample, then the rest): a
        // programme or intake committed meanwhile is waited for, then seen; a
        // sample filed under this family meanwhile waits on the index range
        // (Sample_productTypeId_fkey) — so the open-sample check below misses
        // none. A family delete takes them the other way: its deadlock comes
        // back as 1213, `isLockConflict`, 409, nothing written.
        await tx.$queryRaw`SELECT \`id\` FROM \`Sample\` WHERE \`productTypeId\` = ${id} FOR SHARE`;
        // The family, its rows and their parameters held until the commit: a
        // grid saved, a reclassification (D-19) or a second split waits, then
        // finds another version. The reads below come after the locks (the
        // transaction's first plain read), so they see what was committed
        // before the locks were granted.
        await tx.$queryRaw`SELECT \`id\` FROM \`ProductType\` WHERE \`id\` = ${id} FOR UPDATE`;
        await tx.$queryRaw`SELECT \`id\` FROM \`Criterion\` WHERE \`productTypeId\` = ${id} FOR UPDATE`;
        await tx.$queryRaw`SELECT p.\`id\` FROM \`AnalysisParameter\` p JOIN \`Criterion\` c ON c.\`parameterId\` = p.\`id\` WHERE c.\`productTypeId\` = ${id} FOR SHARE OF p`;

        const loaded = await loadSplit(tx, id);
        if (!loaded) return { kind: "refused", status: 404, error: "Famille de produits introuvable." };
        const preview = planFamilySplit(loaded);
        const decision = decideSplit(preview, ask, loaded.criteria);
        if (!decision.ok) {
          return { kind: "refused", status: decision.status, error: decision.error, blockingSamples: decision.blockingSamples, preview };
        }
        const { source } = loaded;
        const nature = loaded.natures.find((candidate) => candidate.id === decision.natureId)!;

        const name = splitNameCheck(ask.name, source.clientId, await nameCandidates(tx, source.clientId), id);
        if (name.taken) {
          return { kind: "refused", status: 409, error: "Une famille de produits de ce nom existe déjà : choisissez un autre nom." };
        }
        if (name.similar.length > 0 && !ask.confirmSimilar) {
          return { kind: "refused", status: 409, error: "Une famille de produits très proche existe déjà.", similar: name.similar };
        }

        const created = await tx.productType.create({
          data: {
            name: ask.name,
            normalizedName: normalizeLabel(ask.name),
            family: nature.family,
            natureId: nature.id,
            clientId: source.clientId,
            active: source.active,
            regulationId: source.regulationId,
          },
          select: { id: true, name: true, normalizedName: true, family: true, natureId: true, clientId: true, active: true, regulationId: true },
        });
        const moved = decision.moved;
        await tx.criterion.createMany({ data: moved.map((row) => ({ productTypeId: created.id, ...copiedCriterion(row) })) });
        const { count } = await tx.criterion.updateMany({
          where: { id: { in: moved.map((row) => row.id) }, productTypeId: id, active: true },
          data: { active: false },
        });
        if (count !== moved.length) throw new SplitConflict();

        const sourceActiveBefore = loaded.criteria.filter((row) => row.active).length;
        const sourceActiveAfter = await tx.criterion.count({ where: { productTypeId: id, active: true } });
        if (sourceActiveAfter !== sourceActiveBefore - moved.length) throw new SplitConflict();

        const journal = splitJournal({
          source: { id, name: source.name },
          created: { ...created, natureId: nature.id },
          domain: ask.domain,
          moved,
          sourceRows: loaded.criteria.length,
          sourceActiveBefore,
          sourceActiveAfter,
        });
        // In the transaction: the journal is part of the split, not a later extra.
        await tx.auditLog.createMany({
          data: [
            { actorId: session.id, action: "PRODUCT_TYPE_CREATED", entity: "ProductType", entityId: created.id, metadata: JSON.stringify(journal.created) },
            { actorId: session.id, action: "CRITERIA_UPDATED", entity: "ProductType", entityId: id, metadata: JSON.stringify(journal.sourceCriteria) },
            { actorId: session.id, action: "CRITERIA_UPDATED", entity: "ProductType", entityId: created.id, metadata: JSON.stringify(journal.newCriteria) },
          ],
        });

        return { kind: "done", id: created.id, name: created.name, moved: moved.length, sourceActiveBefore, sourceActiveAfter };
      },
      // Several hundred rows copied for the largest merged family (AUTRES: 299).
      { timeout: 30_000 }
    );
  } catch (error) {
    if (error instanceof SplitConflict || isLockConflict(error)) {
      return NextResponse.json({ error: SPLIT_BUSY_ERROR }, { status: 409 });
    }
    console.error("[product-types/split] failed", { id, error });
    return NextResponse.json({ error: "La scission a échoué — rien n'a été modifié." }, { status: 500 });
  }

  if (outcome.kind === "refused") {
    return NextResponse.json(
      { error: outcome.error, blockingSamples: outcome.blockingSamples, similar: outcome.similar, preview: outcome.preview },
      { status: outcome.status }
    );
  }
  return NextResponse.json(
    {
      id: outcome.id,
      name: outcome.name,
      moved: outcome.moved,
      sourceActiveBefore: outcome.sourceActiveBefore,
      sourceActiveAfter: outcome.sourceActiveAfter,
    },
    { status: 201 }
  );
}
