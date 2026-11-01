import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getCompany } from "@/lib/company-server";
import { parseSenderSettings, type SenderSettings } from "@/lib/email-sender";

const SENDER_SELECT = { emailSenderAddress: true, emailSenderName: true, emailReplyTo: true } as const;

/**
 * « Envoi des e-mails » (RETOUR-LABO-28-10.md L4 — « Nous n'utilisons pas
 * d'adresse no-reply ! »): the laboratory's mailbox the e-mails leave from,
 * the name shown beside it and the Reply-To (`senderHeaders`). `PUT` the
 * three fields, blank = cleared (the configuration `EMAIL_FROM`, else the
 * identity's e-mail). ADMIN only, journalled before → after.
 */
export async function PUT(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const parsed = parseSenderSettings(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const current = await prisma.companySettings.findUnique({ where: { id: "company" }, select: SENDER_SELECT });
  const before: SenderSettings = current ?? { emailSenderAddress: null, emailSenderName: null, emailReplyTo: null };
  let saved: SenderSettings;
  if (!current) {
    const { logoData, ...identity } = await getCompany();
    saved = await prisma.companySettings.create({ data: { id: "company", ...identity, logoData, ...parsed.value }, select: SENDER_SELECT });
  } else {
    saved = await prisma.companySettings.update({ where: { id: "company" }, data: parsed.value, select: SENDER_SELECT });
  }

  await logAudit({
    actorId: session.id,
    action: "EMAIL_SENDER_UPDATED",
    entity: "CompanySettings",
    entityId: "company",
    metadata: { before, after: saved },
  });
  return NextResponse.json(saved);
}
