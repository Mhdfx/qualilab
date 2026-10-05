import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { isOnBenchOf } from "@/lib/bench-access";

/**
 * Loads a sample for the technician working on it.
 *
 * A technician may only ever touch the samples on their bench — checked
 * here, on the server, for every result operation. Since the programme
 * d'analyse (PROGRAMME.md §6) a line is on a technician's bench when they
 * hold the sample (`Sample.technicianId`) **or** one of its parameters
 * (`SampleParameter.technicianId`); which parameters they may actually type
 * is decided line by line by `canEditParameter`. ADMIN can act on any sample.
 */
export async function loadAssignedSample(
  sampleId: string,
  session: SessionUser
) {
  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: {
      id: true,
      code: true,
      status: true,
      technicianId: true,
      analysisBlocked: true,
      unitCount: true,
      parameters: {
        select: {
          parameterId: true,
          // The programme per parameter: its technician, its norm version,
          // its dilution (PROGRAMME.md §3).
          technicianId: true,
          technician: { select: { name: true } },
          normVersionId: true,
          dilutionFactor: true,
          parameter: {
            select: {
              id: true,
              name: true,
              unit: true,
              threshold: true,
              limitValue: true,
              calcFactor: true,
            },
          },
        },
      },
    },
  });

  if (!sample) {
    return {
      error: NextResponse.json(
        { error: "Échantillon introuvable." },
        { status: 404 }
      ),
    };
  }

  if (session.role === "TECHNICIEN" && !isOnBenchOf(sample, session.id)) {
    return {
      error: NextResponse.json(
        { error: "Cet échantillon ne vous est pas attribué." },
        { status: 403 }
      ),
    };
  }

  // Held at reception (LabSettings.blockNonConformAtReception): nobody —
  // not even the ADMIN — analyses it until the release assigns a technician.
  if (sample.analysisBlocked) {
    return {
      error: NextResponse.json(
        {
          error:
            "Cet échantillon est bloqué en réception — un administrateur doit le libérer avant toute analyse.",
        },
        { status: 409 }
      ),
    };
  }

  return { sample };
}

export type AssignedSample = NonNullable<
  Awaited<ReturnType<typeof loadAssignedSample>>["sample"]
>;
