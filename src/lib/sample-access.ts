import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";

/**
 * Loads a sample for the technician working on it.
 *
 * A technician may only ever touch the samples assigned to them — checked here,
 * on the server, for every result operation. ADMIN can act on any sample.
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
      parameters: {
        select: {
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

  if (session.role === "TECHNICIEN" && sample.technicianId !== session.id) {
    return {
      error: NextResponse.json(
        { error: "Cet échantillon ne vous est pas attribué." },
        { status: 403 }
      ),
    };
  }

  return { sample };
}

export type AssignedSample = NonNullable<
  Awaited<ReturnType<typeof loadAssignedSample>>["sample"]
>;
