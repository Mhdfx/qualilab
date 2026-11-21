import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RECONSTRUCTED_LABEL, amendedNumber, parseCorrectionTrace } from "@/lib/report-amendment";

/**
 * « Versions du rapport » (AMENDEMENT.md §4): every issued version — number,
 * date, reason, who approved it — newest first, each with its PDF
 * (`/api/samples/[id]/report?version=N`). The version in force of a report
 * never amended is not frozen yet: it is listed from the report itself.
 * Read-only; the roles that already read the report (`REPORT_READ_ROLES`).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("VALIDATEUR", "DIRECTION", "GESTIONNAIRE", "COMPTABLE", "ADMIN");
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
              // K11: the corrections before send of this version (internal trace).
              correctedBeforeSend: true,
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

  const traces = new Map(report.versions.map((v) => [v.version, parseCorrectionTrace(v.correctedBeforeSend)]));
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
    // K11: each correction before send of this version — when, why, by whom;
    // the data replaced stay internal (no PDF: never printed nor sent).
    corrections: (traces.get(v.version)?.replaced ?? []).map((row) => ({
      issuedAt: row.issuedAt,
      correctedAt: row.correctedAt,
      reissuedAt: row.reissuedAt,
      reason: row.reason,
      by: row.correctedByName,
    })),
  }));
  // A correction before send in progress (K11): the same number will be issued again.
  const correcting = report.amendmentPending && traces.get(report.version)?.pending ? traces.get(report.version)!.pending : null;
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
      corrections: [],
    });
  }

  return NextResponse.json({
    number: amendedNumber(report.number, report.version),
    version: report.version,
    amendmentPending: report.amendmentPending,
    // « correction » (K11) or « amendment »: what the next approval issues.
    pendingKind: report.amendmentPending ? (correcting ? "correction" : "amendment") : null,
    // The reason of the change in progress — not yet printed anywhere (a correction's never is).
    pendingNote: correcting ? correcting.reason : report.amendmentPending ? report.amendmentNote : null,
    nextNumber: report.amendmentPending
      ? amendedNumber(report.number, correcting ? report.version : report.version + 1)
      : null,
    versions,
  });
}
