import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { listDocumentReferences } from "@/lib/document-reference";
import { DOC_TYPES, type DocType } from "@/lib/document-types";

/**
 * The cartouches of the quality documents (Réf / version / dates) — ADMIN
 * only. Saving here is what a new version of a form costs: no code.
 */
export async function GET() {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;
  return NextResponse.json(await listDocumentReferences());
}

type Item = { docType: DocType; reference: string; version: string; createdOn: Date | null; updatedOn: Date | null };

function parseDate(value: unknown, label: string): Date | null | string {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return `${label} : date invalide.`;
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? `${label} : date invalide.` : d;
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

  const raw = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ error: "Aucun document à enregistrer." }, { status: 400 });
  }

  const items: Item[] = [];
  for (const entry of raw as Record<string, unknown>[]) {
    const docType = String(entry?.docType ?? "") as DocType;
    if (!DOC_TYPES.includes(docType)) {
      return NextResponse.json({ error: "Type de document inconnu." }, { status: 400 });
    }
    const reference = typeof entry.reference === "string" ? entry.reference.trim() : "";
    const version = typeof entry.version === "string" ? entry.version.trim() : "";
    if (reference.length > 40 || version.length > 10) {
      return NextResponse.json({ error: `${docType} : référence (40) ou version (10) trop longue.` }, { status: 400 });
    }
    // Both empty = « not filled yet »; a reference without version is a half-cartouche.
    if ((reference && !version) || (!reference && version)) {
      return NextResponse.json({ error: `${docType} : indiquez la référence et la version.` }, { status: 400 });
    }
    const createdOn = parseDate(entry.createdOn, `${docType} · création`);
    if (typeof createdOn === "string") return NextResponse.json({ error: createdOn }, { status: 400 });
    const updatedOn = parseDate(entry.updatedOn, `${docType} · mise à jour`);
    if (typeof updatedOn === "string") return NextResponse.json({ error: updatedOn }, { status: 400 });
    if (createdOn && updatedOn && updatedOn < createdOn) {
      return NextResponse.json({ error: `${docType} : la mise à jour précède la création.` }, { status: 400 });
    }
    items.push({ docType, reference, version, createdOn, updatedOn });
  }

  const before = await listDocumentReferences();

  await prisma.$transaction(
    items.map((item) =>
      prisma.documentReference.upsert({
        where: { docType: item.docType },
        create: item,
        update: { reference: item.reference, version: item.version, createdOn: item.createdOn, updatedOn: item.updatedOn },
      })
    )
  );

  const after = await listDocumentReferences();
  const changed = after
    .filter((row) => {
      const previous = before.find((b) => b.docType === row.docType);
      return JSON.stringify(previous) !== JSON.stringify(row);
    })
    .map((row) => row.docType);

  if (changed.length > 0) {
    await logAudit({
      actorId: session.id,
      action: "DOCUMENT_REFERENCE_UPDATED",
      entity: "DocumentReference",
      entityId: changed.join(","),
      metadata: {
        changed,
        before: before.filter((b) => changed.includes(b.docType)),
        after: after.filter((a) => changed.includes(a.docType)),
      },
    });
  }

  return NextResponse.json(after);
}
