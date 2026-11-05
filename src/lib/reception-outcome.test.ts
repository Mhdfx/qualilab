import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CANCEL_REASON_LABELS, RECEPTION_DECISION_LABELS } from "./labels";
import { RECEPTION_DECISIONS } from "./client-consultation";
import { RELEASE_DECISIONS } from "./release-rules";
import { BENCH_STATUSES } from "./bench-access";
import { destructionEmail, type DestructionEmailInput } from "./emails/templates";
import { sampleTimeline, type TimelineAuditRow, type TimelineSample } from "./sample-timeline";
import { cancelReasonsFor } from "@/components/samples/sample-verbs-logic";
import {
  CANCELLING_DECISIONS,
  NOT_ANALYSED_OUTCOME,
  NOT_ANALYSED_SUFFIX,
  RECEPTION_CANCEL_REASONS,
  isReceptionCancel,
  receptionCancelReason,
} from "./reception-outcome";

/**
 * I9 (RETOUR-LABO-04-11.md §5, answer R-9 of 04/11): « Rejeter (rendu au
 * client) » next to « Détruire » — at the reception of a série, at the
 * counter and at the release of a held sample.
 */

const source = (relative: string) => readFileSync(join(process.cwd(), relative), "utf8");

describe("the decision and its motif", () => {
  it("is offered everywhere « Détruire » is: reception, counter, release", () => {
    expect(RECEPTION_DECISION_LABELS.REJETER).toBe("Rejeter (rendu au client)");
    expect(RECEPTION_DECISIONS).toEqual(["ANALYSER", "EN_ATTENTE_CLIENT", "DETRUIRE", "REJETER"]);
    expect(RELEASE_DECISIONS).toContain("REJETER");
    expect(CANCEL_REASON_LABELS.REJETE_A_RECEPTION).toBe("Rejeté à réception — rendu au client");
  });

  it("writes its own motif — never the destruction's", () => {
    expect(receptionCancelReason("REJETER")).toBe("REJETE_A_RECEPTION");
    expect(receptionCancelReason("DETRUIRE")).toBe("DETRUIT_A_RECEPTION");
    for (const decision of ["ANALYSER", "EN_ATTENTE_CLIENT", "toString", "", "rejeter"]) expect(receptionCancelReason(decision)).toBeNull();
    expect(CANCELLING_DECISIONS).toEqual({ DETRUIRE: "DETRUIT_A_RECEPTION", REJETER: "REJETE_A_RECEPTION" });
  });

  it("knows the reception's two motifs apart from the others", () => {
    expect(RECEPTION_CANCEL_REASONS).toEqual(["DETRUIT_A_RECEPTION", "REJETE_A_RECEPTION"]);
    expect(isReceptionCancel("REJETE_A_RECEPTION")).toBe(true);
    expect(isReceptionCancel("DETRUIT_A_RECEPTION")).toBe(true);
    for (const other of ["NON_RECU", "AUTRE", "DOUBLON", null, undefined, ""]) expect(isReceptionCancel(other)).toBe(false);
    expect(NOT_ANALYSED_OUTCOME.REJETE_A_RECEPTION).toBe("Rejeté — rendu au client");
    expect(NOT_ANALYSED_SUFFIX.REJETE_A_RECEPTION).toBe("rejeté, rendu au client");
  });

  it("is the reception's own verb: « Annuler » never offers it, on any status", () => {
    for (const status of ["PRELEVE", "RECU", "PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"] as const) {
      expect(cancelReasonsFor(status)).not.toContain("REJETE_A_RECEPTION");
      expect(cancelReasonsFor(status)).not.toContain("DETRUIT_A_RECEPTION");
    }
    // The cancel route's own list does not accept it either.
    expect(source("src/app/api/samples/[id]/cancel/route.ts")).not.toMatch(/REJETE_A_RECEPTION/);
  });
});

describe("the routes write it — received, numbered, cancelled at once, journalled", () => {
  it("the reception of a série cancels a rejected line with its motif and journals it", () => {
    const route = source("src/app/api/series/[id]/reception/route.ts");
    expect(route).toMatch(/const steps = line\.cancelReason \? \(\["RECU", "ANNULE"\] as const\)/);
    expect(route).toMatch(/cancelReason: line\.cancelReason \}/);
    expect(route).toMatch(/rejected: line\.reject,/);
    expect(route).toMatch(/\.filter\(\(line\) => line\.cancelReason\)\s*\.map\(\(line\) =>\s*logAudit\(\{[\s\S]*?action: "SAMPLE_CANCELLED"[\s\S]*?reason: line\.cancelReason,/);
    expect(route).toMatch(/rejected: input\.lines\.filter\(\(l\) => l\.reject\)/);
    expect(route).toMatch(/notifyDestroyed\(\s*input\.lines\.filter\(\(line\) => line\.cancelReason\)/);
  });

  it("the counter does the same for a deposit line", () => {
    const create = source("src/lib/serie-create.ts");
    expect(create).toMatch(/const cancelReason = isDeposit \? line\.cancelReason : null;/);
    expect(create).toMatch(/status: cancelReason \? "ANNULE"/);
    expect(create).toMatch(/if \(line\.cancelReason\) \{[\s\S]*?reason: line\.cancelReason,/);
    expect(create).toMatch(/rejected: input\.lines\.flatMap\(\(l, i\) => \(l\.reject \? \[i \+ 1\] : \[\]\)\)/);
    const route = source("src/app/api/series/route.ts");
    expect(route).toMatch(/created\.samples\.filter\(\(s\) => lines\[s\.lineIndex\]\?\.cancelReason\)/);
    expect(route).toMatch(/rejected: line\.reject,/);
  });

  it("the release of a held sample cancels it through the state machine with the decision's motif", () => {
    const route = source("src/app/api/samples/[id]/release/route.ts");
    expect(route).toMatch(/const cancelReason = receptionCancelReason\(decision\);/);
    expect(route).toMatch(/canTransition\("RECU", "ANNULE", session\.role\)/);
    expect(route).toMatch(/cancelledById: session\.id,\s*cancelReason,/);
    expect(route).toMatch(/reason: cancelReason,/);
    expect(route).toMatch(/notifyDestroyed\(\[sample\.id\]/);
  });

  it("a rejected sample reactivated comes back held, as a destroyed one", () => {
    expect(source("src/app/api/samples/[id]/reactivate/route.ts")).toMatch(/isReceptionCancel\(sample\.cancelReason\) \? \{ analysisBlocked: true \}/);
  });

  it("the client's notice covers the rejected lines and says which ones", () => {
    const notice = source("src/lib/destruction-notice.ts");
    expect(notice).toMatch(/cancelReason: \{ in: \[\.\.\.RECEPTION_CANCEL_REASONS\] \}/);
    expect(notice).toMatch(/outcome: s\.cancelReason === "REJETE_A_RECEPTION" \? \("REJETE" as const\) : \("DETRUIT" as const\)/);
  });

  it("the bon de réception is told which line was rejected", () => {
    expect(source("src/app/api/series/[id]/document/route.ts")).toMatch(
      /rejected: s\.status === "ANNULE" && s\.cancelReason === "REJETE_A_RECEPTION",/
    );
  });

  it("the migration only appends the value to the ENUM (additive, every value kept in order)", () => {
    const sql = source("prisma/migrations/20261105020000_lot4b_rejete_a_reception/migration.sql");
    expect(sql).toMatch(
      /MODIFY `cancelReason` ENUM\('NON_EXPLOITABLE', 'QUANTITE_INSUFFISANTE', 'DOUBLON', 'ANNULATION_CLIENT', 'DETRUIT_A_RECEPTION', 'AUTRE', 'NON_RECU', 'REJETE_A_RECEPTION'\) NULL;/
    );
    expect(sql).not.toMatch(/DROP|UPDATE|DELETE/i);
  });
});

describe("out of the bench counters and the ONSSA report", () => {
  it("is ANNULE: never a bench status", () => {
    expect(BENCH_STATUSES).not.toContain("ANNULE");
  });

  it("the ONSSA report counts approved samples only, and leaves ANNULE out of its « not yet approved » count", () => {
    const report = source("src/lib/onssa-report-server.ts");
    expect(report).toMatch(/const COUNTED_STATUSES = \["VALIDE", "RAPPORT_ENVOYE"\] as const;/);
    expect(report).toMatch(/status: \{ notIn: \[\.\.\.COUNTED_STATUSES, "ANNULE"\] \}/);
  });
});

describe("the client's e-mail — « rejeté — rendu » instead of « détruit »", () => {
  const base: DestructionEmailInput = {
    serialNumber: "12/26",
    sampledAt: new Date("2026-10-07T08:00:00Z"),
    samplingTimeDeclared: null,
    receivedAt: null,
    lines: [{ controlCode: "101/26", designation: "Salade", numeroLot: null, lieu: "Cuisine", motif: "Emballage non conforme" }],
  };

  it("keeps the destruction notice word for word", () => {
    const { subject, html } = destructionEmail(base);
    expect(subject).toMatch(/^Échantillon non analysé — dossier 12\/26/);
    expect(html).toContain("jugé non conforme à la réception et détruit.");
    expect(html).not.toContain("Suite donnée");
    expect(html).not.toContain("rendu");
  });

  it("says a rejected line is given back, neither analysed nor destroyed", () => {
    const one = destructionEmail({ ...base, lines: [{ ...base.lines[0], outcome: "REJETE" }] }).html;
    expect(one).toContain("jugé non conforme à la réception et rejeté : il vous est rendu, sans analyse ni destruction par le laboratoire.");
    expect(one).not.toContain("et détruit");
    const two = destructionEmail({
      ...base,
      lines: [
        { ...base.lines[0], outcome: "REJETE" },
        { ...base.lines[0], controlCode: "102/26", outcome: "REJETE" },
      ],
    }).html;
    expect(two).toContain("jugés non conformes à la réception et rejetés : ils vous sont rendus, sans analyse ni destruction par le laboratoire.");
  });

  it("gives each line its own outcome when the série mixes both", () => {
    const { html } = destructionEmail({
      ...base,
      lines: [
        { ...base.lines[0], outcome: "DETRUIT" },
        { ...base.lines[0], controlCode: "102/26", outcome: "REJETE" },
      ],
    });
    expect(html).toContain("jugés non conformes à la réception : la suite donnée à chacun est indiquée ci-dessous.");
    expect(html).toContain(">Suite donnée</th>");
    expect(html).toMatch(/101\/26[\s\S]*?>Détruit<\/td>[\s\S]*?102\/26[\s\S]*?>Rejeté — rendu au client<\/td>/);
  });
});

describe("the parcours", () => {
  const at = (time: string) => new Date(`2026-10-07T${time}:00Z`);
  const sample: TimelineSample = {
    sampledAt: at("07:00"),
    receivedAt: at("09:00"),
    receivedBy: { name: "Réception Test" },
    programmedAt: null,
    programmedBy: null,
    assignedAt: null,
    technician: null,
    validatedAt: null,
    validatedBy: null,
    approvedAt: null,
    approvedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    rejectionReason: null,
    cancelledAt: at("11:00"),
    cancelledBy: { name: "Réception Test" },
    cancelReason: "REJETE_A_RECEPTION",
  };
  const row = (id: string, action: string, time: string, metadata: Record<string, unknown>): TimelineAuditRow => ({
    id,
    action,
    createdAt: at(time),
    actor: { name: "Réception Test" },
    metadata: JSON.stringify(metadata),
  });

  it("names the rejection on the cancellation and on the release that decided it", () => {
    const events = sampleTimeline(sample, [
      row("r1", "SAMPLE_RELEASED", "11:00", { decision: "REJETER", reason: "Le client reprend l'échantillon" }),
      row("r2", "SAMPLE_CANCELLED", "11:00", { reason: "REJETE_A_RECEPTION", note: null }),
    ]);
    const released = events.find((e) => e.label === "Libéré : rejeté, rendu au client");
    expect(released).toMatchObject({ tone: "danger", note: "Le client reprend l'échantillon" });
    const cancelled = events.find((e) => e.label === "Échantillon annulé");
    expect(cancelled?.note).toBe("Rejeté à réception — rendu au client");
  });

  it("keeps « Libéré pour l'analyse » for an analysis, and says « détruit » for a destruction", () => {
    const events = sampleTimeline({ ...sample, cancelledAt: null, cancelledBy: null, cancelReason: null }, [
      row("a1", "SAMPLE_RELEASED", "10:00", { decision: "ANALYSER" }),
    ]);
    expect(events.some((e) => e.label === "Libéré pour l'analyse")).toBe(true);
    const destroyed = sampleTimeline({ ...sample, cancelReason: "DETRUIT_A_RECEPTION" }, [
      row("d1", "SAMPLE_RELEASED", "11:00", { decision: "DETRUIRE" }),
    ]);
    expect(destroyed.some((e) => e.label === "Libéré : détruit")).toBe(true);
  });
});
