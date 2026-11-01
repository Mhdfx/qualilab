import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateAchatSettings } from "@/lib/achat-validation";
import { ACHAT_SETTINGS_ID, achatSettingsOf, loadAchatSettings } from "@/lib/achat-settings";

/**
 * The Achat & Stock settings (lot 3D: expiry window M4, default VAT rate
 * M1, retenue à la source M7). Read by the magasin; changed by the
 * administrator only — the rates of the retenue come from the accountant
 * (R-24), never from the code. Journalled with before / after.
 */
export async function GET() {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;
  return NextResponse.json(await loadAchatSettings());
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
  const validated = validateAchatSettings((body ?? {}) as Record<string, unknown>);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  const before = await loadAchatSettings();
  const row = await prisma.achatStockSettings.upsert({
    where: { id: ACHAT_SETTINGS_ID },
    create: { id: ACHAT_SETTINGS_ID, ...validated.value },
    update: validated.value,
  });
  const after = achatSettingsOf(row);

  await logAudit({
    actorId: session.id,
    action: "ACHAT_SETTINGS_UPDATED",
    entity: "AchatStockSettings",
    entityId: ACHAT_SETTINGS_ID,
    metadata: { before, after },
  });

  return NextResponse.json(after);
}
