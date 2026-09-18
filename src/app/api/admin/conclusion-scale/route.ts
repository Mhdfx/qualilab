import { NextResponse } from "next/server";
import type { Interpretation } from "@/generated/prisma/enums";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const VERDICTS: Interpretation[] = ["SATISFAISANT", "ACCEPTABLE", "NON_SATISFAISANT", "INCOMPLET"];

/** The words the report prints for each verdict (CRITERES.md §2, rule 5). */
export async function GET() {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;
  return NextResponse.json(await prisma.conclusionScale.findMany());
}

export async function PUT(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: "Aucune échelle reçue." }, { status: 400 });

  const rows: { interpretation: Interpretation; label: string; sentence: string }[] = [];
  for (const entry of items as Record<string, unknown>[]) {
    const interpretation = entry?.interpretation as Interpretation;
    if (!VERDICTS.includes(interpretation)) return NextResponse.json({ error: "Verdict inconnu." }, { status: 400 });
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    const sentence = typeof entry.sentence === "string" ? entry.sentence.trim() : "";
    if (!label || !sentence) return NextResponse.json({ error: `${interpretation} : libellé et phrase obligatoires.` }, { status: 400 });
    if (label.length > 60 || sentence.length > 1000) return NextResponse.json({ error: `${interpretation} : texte trop long.` }, { status: 400 });
    rows.push({ interpretation, label, sentence });
  }

  const before = await prisma.conclusionScale.findMany();
  await prisma.$transaction(
    rows.map((row) =>
      prisma.conclusionScale.upsert({ where: { interpretation: row.interpretation }, create: row, update: { label: row.label, sentence: row.sentence } })
    )
  );
  const after = await prisma.conclusionScale.findMany();
  await logAudit({ actorId: session.id, action: "CONCLUSION_SCALE_UPDATED", entity: "ConclusionScale", entityId: null, metadata: { before, after } });
  return NextResponse.json(after);
}
