import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getLabSettings } from "@/lib/lab-settings";

/**
 * The workflow policy switches — one row, ADMIN only. Each switch encodes a
 * client decision still pending (NEEDEDINFO §4): both behaviours are built,
 * flipping the switch is the whole implementation of their answer.
 */
export async function GET() {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;
  return NextResponse.json(await getLabSettings());
}

const SWITCHES = [
  "blockNonConformAtReception",
  "alertAfterTechnicalValidation",
] as const;

export async function PUT(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const data = {} as Record<(typeof SWITCHES)[number], boolean>;

  for (const field of SWITCHES) {
    if (typeof input[field] !== "boolean") {
      return NextResponse.json(
        { error: `Le réglage « ${field} » doit être vrai ou faux.` },
        { status: 400 }
      );
    }
    data[field] = input[field] as boolean;
  }

  const before = await getLabSettings();

  const saved = await prisma.labSettings.upsert({
    where: { id: "lab" },
    create: { id: "lab", ...data },
    update: data,
    select: {
      blockNonConformAtReception: true,
      alertAfterTechnicalValidation: true,
    },
  });

  await logAudit({
    actorId: session.id,
    action: "LAB_SETTINGS_UPDATED",
    entity: "LabSettings",
    entityId: "lab",
    metadata: {
      before,
      after: saved,
      changed: SWITCHES.filter((f) => before[f] !== saved[f]),
    },
  });

  return NextResponse.json(saved);
}
