import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { LOCK_RETRIES, isLockConflict, lockRetryPause } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import {
  checkParameterVersion,
  isOutdatedFormSave,
  PARAMETER_CHANGED_ERROR,
  PARAMETER_PAGE_OUTDATED_ERROR,
  parameterVersion,
  validateParameter,
} from "@/lib/parameter-validation";
import { reclassifyRefusal } from "@/lib/parameter-reclassify";
import { loadReclassifyContext } from "@/lib/parameter-reclassify-store";
import type { AnalysisParameter } from "@/generated/prisma/client";

/** The refusal when the row stayed locked by another write through every retry. */
const PARAMETER_BUSY_ERROR =
  "Une autre opération sur ce paramètre était en cours. Rien n'a été enregistré : réessayez.";

/** What the locked write found: written, or why not. */
type SaveOutcome =
  | { kind: "written" }
  | { kind: "changed"; current: AnalysisParameter }
  | { kind: "missing" }
  | { kind: "busy" };

/**
 * Editing an analysis parameter — its unit, its reference threshold, its
 * numeric limit, whether exceeding it raises a contamination alert, and its
 * family (MICRO / CHIMIE / AUTRE — RETOUR-LABO-06-10.md §5, V3).
 *
 * A field the request leaves out keeps its stored value: `{ threshold }`
 * changes the threshold and nothing else. The screen sends every field ("" =
 * emptied), so nothing changes for it.
 *
 * Every change is audited: a limit decides whether results are declared
 * conform, so the laboratory must be able to see who changed one and when.
 *
 * Optimistic concurrency (open point of D-19): the screen sends `version`,
 * the `parameterVersion` of the row it loaded. A parameter changed since —
 * reclassified by « Reclasser plusieurs paramètres » or edited elsewhere —
 * answers 409 `PARAMETER_CHANGED_ERROR` with the stored row (`current`), so
 * a form opened before a reclassification never sends the old domain back.
 * A script changing a field or two without `version` is not checked; the
 * whole form without `version` is a page loaded before the deploy: refused.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const existing = await prisma.analysisParameter.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Paramètre introuvable." }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  const version = checkParameterVersion(body.version, existing);
  if (version === "invalid") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (version === "stale") {
    return NextResponse.json({ error: PARAMETER_CHANGED_ERROR, current: existing }, { status: 409 });
  }
  // A tab loaded before the deploy runs the old form: every field and no
  // version — it would send back a domain reclassified since (D-19).
  if (isOutdatedFormSave(body)) {
    return NextResponse.json({ error: PARAMETER_PAGE_OUTDATED_ERROR }, { status: 409 });
  }

  const validated = validateParameter({
    name: existing.name,
    category: existing.category,
    family: existing.family,
    unit: existing.unit,
    threshold: existing.threshold,
    limitValue: existing.limitValue,
    alertOnExceed: existing.alertOnExceed,
    calcFactor: existing.calcFactor,
    aliases: existing.aliases,
    ...body,
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  // A change of domain obeys the refusals of the reclassification (D-19); a
  // change of category alone, the rule of the natures only (no profile read).
  const familyChanged = validated.value.family !== existing.family;
  if (familyChanged || validated.value.category !== existing.category) {
    const refusal = reclassifyRefusal(
      { id, name: existing.name, category: validated.value.category, family: existing.family },
      validated.value.family,
      await loadReclassifyContext(familyChanged ? [id] : [])
    );
    if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });
  }

  // A rename (or a move to another domain) must not create a twin.
  if (validated.value.name !== existing.name || validated.value.category !== existing.category) {
    const duplicate = await prisma.analysisParameter.findFirst({
      where: { name: validated.value.name, category: validated.value.category, id: { not: id } },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({ error: "Ce paramètre existe déjà dans cette catégorie." }, { status: 409 });
    }
  }

  // Written only if the row is still the one read above, compared under the
  // row lock (`SELECT … FOR UPDATE`, as `lockTakeState`) by its version —
  // exactly, in JS. Not by the UPDATE's own WHERE: the text columns compare
  // under utf8mb4_unicode_ci, which takes « 10² » for « 102 », « ufc » for
  // « UFC », « µ » for « μ » and ignores accents and trailing spaces, so a
  // correction landing between that read and this write would be undone. A
  // reclassification or another edit committed meanwhile gets the same 409.
  const saveOnce = () =>
    prisma.$transaction(async (tx): Promise<SaveOutcome> => {
      await tx.$queryRaw`SELECT \`id\` FROM \`AnalysisParameter\` WHERE \`id\` = ${id} FOR UPDATE`;
      // Read after the lock (the transaction's first plain read): whatever
      // was committed before the lock was granted is seen here.
      const locked = await tx.analysisParameter.findUnique({ where: { id } });
      if (!locked) return { kind: "missing" };
      if (parameterVersion(locked) !== parameterVersion(existing)) return { kind: "changed", current: locked };
      const { count } = await tx.analysisParameter.updateMany({ where: { id }, data: validated.value });
      return count === 1 ? { kind: "written" } : { kind: "missing" };
    });

  let outcome: SaveOutcome | null = null;
  for (let attempt = 1; outcome === null; attempt += 1) {
    try {
      outcome = await saveOnce();
    } catch (error) {
      // A lock lost to another write (the reclassification's transaction, a
      // second save): nothing was written. It runs again, and then reads
      // under the lock whatever that write committed.
      if (!isLockConflict(error)) throw error;
      if (attempt >= LOCK_RETRIES) outcome = { kind: "busy" };
      else await new Promise((resolve) => setTimeout(resolve, lockRetryPause(attempt)));
    }
  }

  if (outcome.kind === "busy") {
    // « Modifié entre-temps » only if it was: otherwise nothing is reloaded,
    // the form keeps what was typed and the admin saves again.
    const current = await prisma.analysisParameter.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json({ error: "Paramètre introuvable." }, { status: 404 });
    }
    if (parameterVersion(current) !== parameterVersion(existing)) {
      return NextResponse.json({ error: PARAMETER_CHANGED_ERROR, current }, { status: 409 });
    }
    return NextResponse.json({ error: PARAMETER_BUSY_ERROR }, { status: 409 });
  }
  if (outcome.kind === "missing") {
    return NextResponse.json({ error: "Paramètre introuvable." }, { status: 404 });
  }
  if (outcome.kind === "changed") {
    return NextResponse.json({ error: PARAMETER_CHANGED_ERROR, current: outcome.current }, { status: 409 });
  }
  // Every column of the row is in `validated.value`: this is what was written.
  const parameter = { id, ...validated.value };

  await logAudit({
    actorId: session.id,
    action: "PARAMETER_UPDATED",
    entity: "AnalysisParameter",
    entityId: id,
    metadata: {
      name: parameter.name,
      before: {
        name: existing.name,
        category: existing.category,
        family: existing.family,
        unit: existing.unit,
        limitValue: existing.limitValue,
        alertOnExceed: existing.alertOnExceed,
        threshold: existing.threshold,
        calcFactor: existing.calcFactor,
        aliases: existing.aliases,
      },
      after: {
        name: parameter.name,
        category: parameter.category,
        family: parameter.family,
        unit: parameter.unit,
        limitValue: parameter.limitValue,
        alertOnExceed: parameter.alertOnExceed,
        threshold: parameter.threshold,
        calcFactor: parameter.calcFactor,
        aliases: parameter.aliases,
      },
    },
  });

  return NextResponse.json(parameter);
}
