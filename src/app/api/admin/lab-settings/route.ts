import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getLabSettings, LAB_SETTINGS_SELECT, type LabSettings } from "@/lib/lab-settings";

/**
 * The workflow policy — one row, ADMIN only. The two switches encode client
 * decisions still pending (NEEDEDINFO §4); the thresholds are the acceptance
 * rules of the bon de réception (WORKFLOW.md §6), editable without code.
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

/** Numeric thresholds with their plausible range and unit for the message. */
const NUMBERS: { key: keyof LabSettings; label: string; min: number; max: number; integer: boolean }[] = [
  { key: "minFoodMicroG", label: "Quantité minimale aliment (micro)", min: 0, max: 100_000, integer: true },
  { key: "minFoodChemG", label: "Quantité minimale aliment (physico-chimie)", min: 0, max: 100_000, integer: true },
  { key: "minWaterMicroL", label: "Volume minimal eau (micro)", min: 0, max: 1_000, integer: false },
  { key: "minWaterSalmonellaL", label: "Volume minimal eau (Salmonella)", min: 0, max: 1_000, integer: false },
  { key: "minWaterChemL", label: "Volume minimal eau (physico-chimie)", min: 0, max: 1_000, integer: false },
  { key: "histamineUnits", label: "Unités pour l'histamine", min: 1, max: 100, integer: true },
  { key: "histamineUnitG", label: "Poids par unité pour l'histamine", min: 0, max: 100_000, integer: true },
  { key: "coldChainMaxC", label: "Température maximale (chaîne du froid)", min: -80, max: 300, integer: false },
];

const LINE_KINDS = ["ALIMENT", "SURFACE", "MAINS", "EAU", "AIR", "AUTRE"] as const;

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
  const before = await getLabSettings();
  const data: Partial<LabSettings> = {};

  for (const field of SWITCHES) {
    if (typeof input[field] !== "boolean") {
      return NextResponse.json(
        { error: `Le réglage « ${field} » doit être vrai ou faux.` },
        { status: 400 }
      );
    }
    data[field] = input[field] as boolean;
  }

  // Thresholds are optional in the payload (older clients send the switches
  // only); when present they must be plausible numbers.
  for (const item of NUMBERS) {
    const raw = input[item.key];
    if (raw === undefined) continue;
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
    if (!Number.isFinite(n) || n < item.min || n > item.max || (item.integer && !Number.isInteger(n))) {
      return NextResponse.json(
        { error: `« ${item.label} » doit être un nombre${item.integer ? " entier" : ""} entre ${item.min} et ${item.max}.` },
        { status: 400 }
      );
    }
    (data as Record<string, unknown>)[item.key] = n;
  }

  if (input.temperatureRequiredKinds !== undefined) {
    const raw = input.temperatureRequiredKinds;
    const kinds = (Array.isArray(raw) ? raw : String(raw).split(","))
      .map((k) => String(k).trim())
      .filter(Boolean);
    if (kinds.some((k) => !(LINE_KINDS as readonly string[]).includes(k))) {
      return NextResponse.json({ error: "Type de ligne inconnu dans « température obligatoire »." }, { status: 400 });
    }
    data.temperatureRequiredKinds = [...new Set(kinds)].join(",");
  }

  const saved = await prisma.labSettings.upsert({
    where: { id: "lab" },
    create: { id: "lab", ...data },
    update: data,
    select: LAB_SETTINGS_SELECT,
  });

  const changed = (Object.keys(saved) as (keyof LabSettings)[]).filter((k) => before[k] !== saved[k]);

  await logAudit({
    actorId: session.id,
    action: "LAB_SETTINGS_UPDATED",
    entity: "LabSettings",
    entityId: "lab",
    metadata: { before, after: saved, changed },
  });

  return NextResponse.json(saved);
}
