import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  alreadyThereMessage,
  planReclassification,
  refusalMessage,
  validateReclassifyRequest,
  type ReclassifyChange,
} from "@/lib/parameter-reclassify";
import {
  loadReclassifyContext,
  parameterJournalFields,
  RECLASSIFY_PARAMETER_SELECT,
} from "@/lib/parameter-reclassify-store";
import type { Family } from "@/generated/prisma/enums";

/** A parameter changed between the plan and the write: nothing is kept. */
class ReclassifyConflict extends Error {}

/**
 * Changing the domain (MICRO / CHIMIE / AUTRE) of several parameters at once
 * — RETOUR-LABO-19-10.md D-19, « Paramètres d'analyse », administrator only.
 *
 * `{ parameterIds, family, preview }`. With `preview: true` the answer is the
 * plan (`planReclassification`: what changes, what is already there, what is
 * refused and why) and nothing is written — the confirmation dialog lists
 * it. Otherwise all or nothing: any refusal answers 409 with the plan; else
 * every parameter changes in one transaction, each with its own journal
 * entry, the same as the single edit (`PARAMETER_UPDATED`, before / after).
 */
export async function POST(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const checked = validateReclassifyRequest(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const { parameterIds, family, preview } = checked.value;

  const [rows, context] = await Promise.all([
    prisma.analysisParameter.findMany({ where: { id: { in: parameterIds } }, select: RECLASSIFY_PARAMETER_SELECT }),
    loadReclassifyContext(parameterIds),
  ]);
  const plan = planReclassification(parameterIds, rows, family, context);

  if (preview) return NextResponse.json(plan);
  if (plan.refused.length > 0) {
    return NextResponse.json({ error: refusalMessage(plan), ...plan }, { status: 409 });
  }
  if (plan.changes.length === 0) {
    return NextResponse.json({ error: alreadyThereMessage(plan), ...plan }, { status: 400 });
  }

  // One UPDATE per domain left, guarded by that domain: a parameter moved
  // since the plan was read changes the count and rolls everything back.
  const groups = new Map<Family, ReclassifyChange[]>();
  for (const change of plan.changes) groups.set(change.from, [...(groups.get(change.from) ?? []), change]);

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const [from, changes] of groups) {
          const { count } = await tx.analysisParameter.updateMany({
            where: { id: { in: changes.map((change) => change.id) }, family: from },
            data: { family },
          });
          if (count !== changes.length) throw new ReclassifyConflict();
        }
        // The journal reads the rows as written, not as the plan read them:
        // a unit or a limit edited in between is in both before and after.
        // The UPDATE above holds them, so nothing else changes them now.
        const written = await tx.analysisParameter.findMany({
          where: { id: { in: plan.changes.map((change) => change.id) } },
          select: RECLASSIFY_PARAMETER_SELECT,
        });
        const byId = new Map(written.map((row) => [row.id, row]));
        const entries = plan.changes.map((change) => {
          const row = byId.get(change.id);
          if (!row) throw new ReclassifyConflict();
          const after = parameterJournalFields(row);
          return {
            actorId: session.id,
            action: "PARAMETER_UPDATED",
            entity: "AnalysisParameter",
            entityId: change.id,
            metadata: JSON.stringify({
              name: row.name,
              before: { ...after, family: change.from },
              after,
              // The batch it belongs to (D-19): one entry per parameter.
              reclassification: { count: plan.changes.length },
            }),
          };
        });
        for (let i = 0; i < entries.length; i += 200) {
          await tx.auditLog.createMany({ data: entries.slice(i, i + 200) });
        }
      },
      { timeout: 60_000 }
    );
  } catch (error) {
    if (error instanceof ReclassifyConflict) {
      return NextResponse.json(
        { error: "Un des paramètres a changé entre-temps : rechargez la page et recommencez. Rien n'a été modifié." },
        { status: 409 }
      );
    }
    console.error("[parameters/reclassify] failed", { error });
    return NextResponse.json({ error: "Le reclassement a échoué — rien n'a été modifié." }, { status: 500 });
  }

  return NextResponse.json({ ...plan, applied: plan.changes.length });
}
