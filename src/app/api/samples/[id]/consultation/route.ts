import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { CONSULTATION_AFTER_RECEPTION } from "@/lib/lab-proposals";
import {
  CONSULTATION_EDITABLE_STATUSES,
  CONSULTATION_EDIT_MESSAGES,
  consultationChanges,
  consultationEditRefusal,
  consultationRecord,
  parseConsultation,
} from "@/lib/client-consultation";

/**
 * « Accord du client » added or corrected after the reception
 * (RETOUR-LABO-28-10.md I6 — Q75, « Modifiable pouvant le [r]ajouter par la
 * suite ? », to confirm by R-8; `CONSULTATION_AFTER_RECEPTION`):
 * `PUT { name, channel, at?, note? }` on a sample received non conforme, not
 * held « en attente du client » (its release records the agreement), before
 * its technical validation — the validator then reads it on their page.
 *
 * The reception and the administrator only. An agreement is never erased,
 * only corrected (ISO/IEC 17025 §7.4.3: the consultation stays recorded);
 * the journal keeps what it said before and after
 * (`CLIENT_CONSULTATION_UPDATED`). The write re-checks the sample's state in
 * the UPDATE: a validation or a release racing it gets a clean 409.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!CONSULTATION_AFTER_RECEPTION) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  const session = await requireApiRole("RECEPTIONNISTE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const sample = await prisma.sample.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      controlCode: true,
      status: true,
      conformity: true,
      analysisBlocked: true,
      validatedById: true,
      clientConsultedName: true,
      clientConsultationChannel: true,
      clientConsultedAt: true,
      clientConsultationNote: true,
      serie: { select: { serialNumber: true } },
    },
  });
  if (!sample) return NextResponse.json({ error: "Échantillon introuvable." }, { status: 404 });

  const refusal = consultationEditRefusal(session.role, sample);
  if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const parsed = parseConsultation(body, new Date());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const consultation = parsed.value;
  if (!consultation) return NextResponse.json({ error: CONSULTATION_EDIT_MESSAGES.empty }, { status: 400 });

  const before = consultationRecord(sample);
  const after = consultationRecord({
    clientConsultedName: consultation.name,
    clientConsultationChannel: consultation.channel,
    clientConsultedAt: consultation.at,
    clientConsultationNote: consultation.note,
  });
  const changed = consultationChanges(before, after);
  if (changed.length === 0) return NextResponse.json({ error: CONSULTATION_EDIT_MESSAGES.unchanged }, { status: 400 });

  const moved = await prisma.sample.updateMany({
    where: {
      id: sample.id,
      status: { in: [...CONSULTATION_EDITABLE_STATUSES] },
      conformity: false,
      analysisBlocked: false,
      validatedById: null,
    },
    data: {
      clientConsultedName: consultation.name,
      clientConsultationChannel: consultation.channel,
      clientConsultedAt: consultation.at,
      clientConsultationNote: consultation.note,
    },
  });
  if (moved.count === 0) return NextResponse.json({ error: CONSULTATION_EDIT_MESSAGES.stale }, { status: 409 });

  await logAudit({
    actorId: session.id,
    action: "CLIENT_CONSULTATION_UPDATED",
    entity: "Sample",
    entityId: sample.id,
    metadata: {
      code: sample.code,
      controlCode: sample.controlCode,
      serialNumber: sample.serie.serialNumber,
      status: sample.status,
      added: before.name === null,
      changed,
      before,
      after,
    },
  });

  return NextResponse.json({ id: sample.id, consultation: after });
}
