import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { formatIsoDay } from "@/lib/labels";
import { readBackupJournalText } from "@/lib/backup-journal-server";

/**
 * « Télécharger le suivi » (RETOUR-LABO-28-10.md L2, Q97): the backups'
 * journal as written by `scripts/backup-db.sh` — one line per run, CSV
 * separated by « ; », with a BOM so Excel reads the accents. ADMIN only,
 * journalled. 404 while the journal is not reachable.
 */
export async function GET() {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  const text = await readBackupJournalText();
  if (text === null) return NextResponse.json({ error: "Le journal des sauvegardes n'est pas accessible." }, { status: 404 });

  await logAudit({ actorId: session.id, action: "BACKUP_JOURNAL_DOWNLOADED", entity: "Backup", entityId: null, metadata: { bytes: text.length } });
  return new NextResponse(`﻿${text}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="suivi-sauvegardes-${formatIsoDay(new Date())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
