import type { SampleStatus } from "@/generated/prisma/enums";
import type { Role } from "./roles";
import { parseConsultation, type ClientConsultation } from "./client-consultation";

/**
 * Releasing a sample held at reception (`analysisBlocked`, status RECU) —
 * `POST /api/samples/[id]/release`. Pure, shared by the route and the
 * « Bloqués » list of the reception.
 *
 * Two holds exist. « En attente du client » (`awaitingClientSince`, decided
 * at reception): the reception or the admin releases it once the client
 * answered. Any other hold — a destroyed sample reactivated (reactivate
 * route), a sample blocked under the retired policy — stays the admin's.
 *
 * The release decides, it never assigns: « Analyser » unblocks the sample,
 * which joins the programme queue like any received sample, then
 * « À prendre » once programmed — a technician takes it there (prise en
 * charge libre, PROGRAMME.md §10); « Détruire » cancels it (« Détruit à
 * réception ») and the client is told.
 */

export const RELEASE_DECISIONS = ["ANALYSER", "DETRUIRE"] as const;
export type ReleaseDecision = (typeof RELEASE_DECISIONS)[number];

export const RELEASE_REASON_MAX = 2000;

export const RELEASE_MESSAGES = {
  notBlocked: "Cet échantillon n'est pas bloqué en réception.",
  adminOnly: "Seul un administrateur peut libérer cet échantillon : il n'attend pas l'avis du client.",
  decision: "Choisissez : analyser ou détruire l'échantillon.",
  reasonTooLong: "Le motif est trop long (2 000 caractères maximum).",
  already: "Cet échantillon vient d'être libéré.",
} as const;

/** What the guard reads of the sample. */
export type HeldSample = {
  status: SampleStatus;
  analysisBlocked: boolean;
  awaitingClientSince: Date | string | null;
};

/**
 * Why `role` may not release this sample now — 409 when it is not held
 * (anymore), 403 when the hold is not this role's — or null.
 */
export function releaseRefusal(role: Role, sample: HeldSample): { status: 403 | 409; error: string } | null {
  if (!sample.analysisBlocked || sample.status !== "RECU") return { status: 409, error: RELEASE_MESSAGES.notBlocked };
  if (role === "ADMIN") return null;
  if (role === "RECEPTIONNISTE" && sample.awaitingClientSince) return null;
  return { status: 403, error: RELEASE_MESSAGES.adminOnly };
}

/** The screen's question: may this role act on this hold? */
export function canRelease(role: Role, sample: HeldSample): boolean {
  return releaseRefusal(role, sample) === null;
}

export type ReleaseRequest = {
  decision: ReleaseDecision;
  /** The client's agreement — « Analyser » only; null = not recorded. */
  consultation: ClientConsultation | null;
  /** Why, in the releaser's words (optional) — journalled. */
  reason: string | null;
  /** The old body `{ technicianId }` (ADMIN, before A9): an analysis, the technician ignored. */
  legacy: boolean;
};

/**
 * The body `{ decision, consultation?, reason? }`. The old « Libérer pour
 * analyse » sent `{ technicianId }` only: read as « Analyser », the
 * technician ignored — nobody assigns one, a technician takes the sample.
 */
export function parseReleaseBody(
  raw: unknown,
  now: Date
): { ok: true; value: ReleaseRequest } | { ok: false; error: string } {
  const input = (typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  let decision: ReleaseDecision;
  let legacy = false;
  if (input.decision === undefined || input.decision === null) {
    if (typeof input.technicianId !== "string" || !input.technicianId) return { ok: false, error: RELEASE_MESSAGES.decision };
    decision = "ANALYSER";
    legacy = true;
  } else if (typeof input.decision === "string" && (RELEASE_DECISIONS as readonly string[]).includes(input.decision)) {
    decision = input.decision as ReleaseDecision;
  } else {
    return { ok: false, error: RELEASE_MESSAGES.decision };
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length > RELEASE_REASON_MAX) return { ok: false, error: RELEASE_MESSAGES.reasonTooLong };

  // The agreement is recorded for an analysis; a destruction ignores it.
  let consultation: ClientConsultation | null = null;
  if (decision === "ANALYSER") {
    const parsed = parseConsultation(input.consultation, now);
    if (!parsed.ok) return parsed;
    consultation = parsed.value;
  }
  return { ok: true, value: { decision, consultation, reason: reason || null, legacy } };
}

/** « depuis 2 j », « depuis 5 h », « depuis 20 min » — how long a sample has waited. */
export function waitingSince(since: Date | string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 60000));
  if (minutes < 1) return "depuis moins d'une minute";
  if (minutes < 60) return `depuis ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `depuis ${hours} h`;
  return `depuis ${Math.floor(hours / 24)} j`;
}
