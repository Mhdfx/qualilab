import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { TAKE_MESSAGES, isHeldByOther } from "@/lib/bench-access";

/**
 * Loads a sample for the result operations of the bench (`PUT …/results`,
 * `POST …/results/submit`).
 *
 * Prise en charge libre (PROGRAMME.md §10): a technician types on the
 * samples they took and on a free one (the first typed result takes it);
 * a sample a colleague holds is refused here, on the server, with the
 * colleague's name. This is the pre-check: the save reads the holder again
 * under the row lock (`lockTakeState`), where a colleague's take that landed
 * meanwhile is caught. Which parameters may be typed is decided line by
 * line by `canEnterParameter` (legacy lines handed parameter by parameter).
 * ADMIN can act on any sample.
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
      controlCode: true,
      status: true,
      technicianId: true,
      technician: { select: { name: true } },
      analysisBlocked: true,
      unitCount: true,
      parameters: {
        select: {
          parameterId: true,
          // The programme per parameter: its legacy technician, its norm
          // version, its dilution (PROGRAMME.md §3).
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

  if (session.role === "TECHNICIEN" && isHeldByOther(sample, session.id)) {
    const holder =
      sample.technician?.name ?? sample.parameters.find((line) => line.technician)?.technician?.name ?? "un collègue";
    return {
      error: NextResponse.json({ error: TAKE_MESSAGES.heldByOther(holder) }, { status: 403 }),
    };
  }

  // Held at reception — « en attente du client » (A9), or another hold:
  // nobody, not even the ADMIN, analyses it before its release (which
  // assigns nobody: after its programme it waits in « À prendre »).
  if (sample.analysisBlocked) {
    return {
      error: NextResponse.json(
        {
          error:
            "Cet échantillon est bloqué en réception — il doit être libéré depuis « Bloqués » de la réception avant toute analyse.",
        },
        { status: 409 }
      ),
    };
  }

  return { sample };
}
