import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RECONSTRUCTED_LABEL, amendedNumber } from "@/lib/report-amendment";

/**
 * « Versions du rapport » (AMENDEMENT.md §4): every issued version — number,
 * date, reason, who approved it — newest first, each with its PDF
 * (`/api/samples/[id]/report?version=N`). The version in force of a report
 * never amended is not frozen yet: it is listed from the report itself.
 * Read-only; the roles that already read the report.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("VALIDATEUR", "GESTIONNAIRE", "COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const sample = await prisma.sample.findUnique({
    where: { id },
    select: {
      status: true,
      approvedAt: true,
      approvedBy: { select: { name: true } },
      report: {
        select: {
          number: true,
          version: true,
          amendmentPending: true,
          amendmentNote: true,
          createdAt: true,
          versions: {
            select: {
              version: true,
              number: true,
              note: true,
              reconstructed: true,
              issuedAt: true,
              issuedBy: { select: { name: true } },
            },
            orderBy: { version: "desc" },
          },
        },
      },
    },
  });

  if (!sample) {
    return NextResponse.json({ error: "Échantillon introuvable." }, { status: 404 });
  }
  const report = sample.report;
  if (!report) {
    return NextResponse.json({ error: "Aucun rapport : cet échantillon n'a pas encore reçu la validation administrative." }, { status: 409 });
  }

  const versions = report.versions.map((v) => ({
    version: v.version,
    number: v.number,
    issuedAt: v.issuedAt.toISOString(),
    note: v.note,
    issuedBy: v.issuedBy?.name ?? null,
    reconstructed: v.reconstructed,
    label: v.reconstructed ? RECONSTRUCTED_LABEL : null,
    current: v.version === report.version,
    url: `/api/samples/${id}/report?version=${v.version}`,
  }));
  if (!versions.some((v) => v.current)) {
    // Issued before versions existed and never amended: the live report.
    versions.unshift({
      version: report.version,
      number: amendedNumber(report.number, report.version),
      issuedAt: (sample.approvedAt ?? report.createdAt).toISOString(),
      note: null,
      issuedBy: sample.approvedBy?.name ?? null,
      reconstructed: false,
      label: null,
      current: true,
      url: `/api/samples/${id}/report`,
    });
  }

  return NextResponse.json({
    number: amendedNumber(report.number, report.version),
    version: report.version,
    amendmentPending: report.amendmentPending,
    // The reason of the amendment in progress — not yet printed anywhere.
    pendingNote: report.amendmentPending ? report.amendmentNote : null,
    nextNumber: report.amendmentPending ? amendedNumber(report.number, report.version + 1) : null,
    versions,
  });
}
