import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  EXCLUDED_ACTIONS,
  SAME_STEP_MS,
  TIMELINE_ACTIONS,
  TIMELINE_ACTION_CODES,
  sampleTimeline,
  type TimelineAuditRow,
  type TimelineSample,
} from "./sample-timeline";

const at = (time: string) => new Date(`2026-10-07T${time}:00Z`);
const person = (name: string) => ({ name });

/** A sample with nothing recorded but its sampling: a never-received one. */
const bare: TimelineSample = {
  sampledAt: at("07:00"),
  receivedAt: null,
  receivedBy: null,
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
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: null,
};

let next = 0;
const row = (action: string, time: string, actor: string | null, metadata?: Record<string, unknown>): TimelineAuditRow => ({
  id: `row${(next += 1)}`,
  action,
  createdAt: at(time),
  actor: actor ? person(actor) : null,
  metadata: metadata ? JSON.stringify(metadata) : null,
});

describe("sampleTimeline — merging timestamps and the journal", () => {
  it("shows only the sampling for a sample nothing else happened to (never invents a step)", () => {
    const events = sampleTimeline(bare, []);
    expect(events.map((e) => e.label)).toEqual(["Prélèvement"]);
    expect(events[0].actor).toBeNull();
  });

  it("never shows a deposit's entry time as its sampling when « Prélevé le » was left empty", () => {
    const received = { ...bare, receivedAt: at("09:00"), receivedBy: person("Réception Test") };
    expect(sampleTimeline({ ...received, samplingTimeDeclared: false }, []).map((e) => e.label)).toEqual(["Réception"]);
    // Declared, a visit (null) or an older série (absent): shown as recorded.
    for (const samplingTimeDeclared of [true, null, undefined]) {
      expect(sampleTimeline({ ...received, samplingTimeDeclared }, []).map((e) => e.label)).toEqual(["Prélèvement", "Réception"]);
    }
  });

  it("shows an old sample's timestamps with their signers when the journal has nothing", () => {
    const events = sampleTimeline(
      {
        ...bare,
        receivedAt: at("09:00"),
        receivedBy: person("Réception Test"),
        validatedAt: at("15:00"),
        validatedBy: person("Validateur Test"),
        approvedAt: at("16:00"),
        approvedBy: person("Admin Test"),
      },
      []
    );
    expect(events.map((e) => [e.label, e.actor])).toEqual([
      ["Prélèvement", null],
      ["Réception", "Réception Test"],
      ["Validation technique", "Validateur Test"],
      ["Validation administrative", "Admin Test"],
    ]);
  });

  it("shows a step recorded by both once, from the journal, with its author", () => {
    const events = sampleTimeline(
      { ...bare, receivedAt: at("09:00"), receivedBy: person("Réception Test") },
      [row("SAMPLE_RECEIVED", "09:00", "Réception Test", { conformity: true })]
    );
    expect(events.filter((e) => e.label === "Réception")).toHaveLength(1);
    expect(events[1].key).toMatch(/^audit-/);
  });

  it("keeps a timestamp the journal does not cover within the same-step window", () => {
    const later = new Date(at("09:00").getTime() + SAME_STEP_MS + 1000);
    const events = sampleTimeline(
      { ...bare, receivedAt: at("09:00"), receivedBy: person("Réception Test") },
      [{ ...row("SAMPLE_RECEIVED", "09:00", "Réception Test"), createdAt: later }]
    );
    expect(events.filter((e) => e.label === "Réception")).toHaveLength(2);
  });

  it("keeps the whole history: a rejection, then a new validation", () => {
    const events = sampleTimeline(
      {
        ...bare,
        validatedAt: at("14:00"),
        validatedBy: person("Validateur Test"),
        rejectedAt: at("12:00"),
        rejectedBy: person("Validateur Test"),
        rejectionReason: "Refaire la lecture",
      },
      [
        row("RESULTS_SUBMITTED", "11:00", "Technicien Test", { nonConformes: 1, anomalies: 0 }),
        row("SAMPLE_REJECTED", "12:00", "Validateur Test", { reason: "Refaire la lecture" }),
        row("RESULTS_SUBMITTED", "13:30", "Technicien Test", { nonConformes: 0, anomalies: 2 }),
        row("SAMPLE_VALIDATED_TECHNICAL", "14:00", "Validateur Test", { regulation: "Règlement test" }),
      ]
    );
    expect(events.map((e) => [e.label, e.note])).toEqual([
      ["Prélèvement", null],
      ["Résultats soumis à validation", "1 résultat non conforme"],
      ["Renvoyé au technicien", "Refaire la lecture"],
      ["Résultats soumis à validation", "2 anomalies"],
      ["Validation technique", "Réglementation : Règlement test"],
    ]);
    expect(events[2].tone).toBe("warning");
  });

  it("orders the steps by date, the circuit's order breaking ties", () => {
    const events = sampleTimeline(bare, [
      row("REPORT_SENT", "16:00", "Admin Test", { number: "RAP-2026-00001", to: ["qualite@example.test"], status: "ENVOYE" }),
      row("SAMPLE_APPROVED", "16:00", "Admin Test", { reportNumber: "RAP-2026-00001" }),
      row("CONTAMINATION_ALERT_SENT", "16:00", "Admin Test", { germe: "Listeria", status: "ENVOYE" }),
    ]);
    expect(events.map((e) => e.label)).toEqual([
      "Prélèvement",
      "Alerte de contamination envoyée",
      "Validation administrative",
      "Rapport envoyé au client",
    ]);
  });

  it("keeps the administrative validation before the report it sent, though journalled after it", () => {
    // The approve route journals SAMPLE_APPROVED once the report is issued
    // and sent: its row is seconds later than REPORT_SENT (local recette V11-B7).
    const approvedAt = at("16:00");
    const later = (seconds: number) => new Date(approvedAt.getTime() + seconds * 1000);
    const events = sampleTimeline({ ...bare, approvedAt, approvedBy: person("Admin Test") }, [
      { ...row("REPORT_SENT", "16:00", "Admin Test", { number: "RAP-2026-00001", to: ["qualite@example.test"], status: "SIMULE" }), createdAt: later(3) },
      { ...row("CONTAMINATION_ALERT_SENT", "16:00", "Admin Test", { germe: "Listeria", status: "SIMULE" }), createdAt: later(4) },
      { ...row("SAMPLE_APPROVED", "16:00", "Admin Test", { reportNumber: "RAP-2026-00001" }), createdAt: later(5) },
    ]);
    expect(events.map((e) => e.label)).toEqual([
      "Prélèvement",
      "Validation administrative",
      "Rapport envoyé au client",
      "Alerte de contamination envoyée",
    ]);
    // Shown once, from the journal (its author and note), at the sample's time.
    expect(events.filter((e) => e.label === "Validation administrative")).toHaveLength(1);
    expect(events[1]).toMatchObject({ actor: "Admin Test", note: "Rapport RAP-2026-00001", at: approvedAt });
    expect(events[1].key).toMatch(/^audit-/);
  });

  it("leaves out downloads, duplicatas and the bench's intermediate saves", () => {
    const events = sampleTimeline(bare, [
      row("REPORT_DOWNLOADED", "17:00", "Gestion Test"),
      row("REPORT_DUPLICATE", "17:05", "Admin Test", { number: "RAP-2026-00001" }),
      row("RESULTS_SAVED", "10:00", "Technicien Test", { count: 3 }),
      row("SOMETHING_ELSE", "10:30", "Admin Test"),
    ]);
    expect(events.map((e) => e.label)).toEqual(["Prélèvement"]);
    for (const action of EXCLUDED_ACTIONS) expect(TIMELINE_ACTION_CODES).not.toContain(action);
  });

  it("puts the technician on the step that assigned them, or alone when no step did", () => {
    const programmed = sampleTimeline(
      { ...bare, programmedAt: at("10:00"), programmedBy: person("Programme Test"), assignedAt: at("10:00"), technician: person("Technicien Test") },
      [row("SAMPLE_PROGRAMMED", "10:00", "Programme Test")]
    );
    expect(programmed.map((e) => [e.label, e.note])).toEqual([
      ["Prélèvement", null],
      ["Programme d'analyse confirmé", "Technicien : Technicien Test"],
    ]);

    const alone = sampleTimeline({ ...bare, assignedAt: at("11:00"), technician: person("Technicien Test") }, []);
    expect(alone.map((e) => [e.label, e.actor, e.note])).toEqual([
      ["Prélèvement", null, null],
      ["Attribué à un technicien", null, "Technicien : Technicien Test"],
    ]);
  });

  it("writes the notes the journal carries, and says when a send was simulated or failed", () => {
    const events = sampleTimeline(bare, [
      row("SAMPLE_CANCELLED", "08:00", "Réception Test", { reason: "DOUBLON", note: "Saisi deux fois" }),
      row("CONTAMINATION_ALERT_SENT", "09:00", "Admin Test", { germe: "Salmonella", status: "ECHEC" }),
      row("REPORT_SENT", "09:30", "Gestion Test", { number: "RAP-2026-00002", to: ["a@example.test", "b@example.test"], status: "SIMULE" }),
      row("REPORT_REOPENED", "10:00", "Admin Test", { number: "RAP-2026-00002", reason: "Erreur de lot" }),
      row("REPORT_AMENDED", "11:00", "Admin Test", { number: "RAP-2026-00002-A1", note: "Erreur de lot" }),
    ]);
    expect(events.slice(1).map((e) => [e.label, e.note])).toEqual([
      ["Échantillon annulé", "Doublon — Saisi deux fois"],
      ["Alerte de contamination non envoyée", "Salmonella — échec de l'envoi"],
      ["Rapport envoyé au client", "RAP-2026-00002 — a@example.test, b@example.test — envoi simulé"],
      ["Rapport rouvert pour amendement", "RAP-2026-00002 — Erreur de lot"],
      ["Rapport amendé émis", "RAP-2026-00002-A1 — Erreur de lot"],
    ]);
  });

  it("survives a journal row whose metadata is not JSON, and an author since removed", () => {
    const events = sampleTimeline(bare, [{ id: "x", action: "SAMPLE_REJECTED", createdAt: at("12:00"), actor: null, metadata: "{oops" }]);
    expect(events[1]).toMatchObject({ label: "Renvoyé au technicien", actor: null, note: null });
  });
});

describe("TIMELINE_ACTIONS covers the circuit's journal codes", () => {
  /** Every `action: "SAMPLE_…"` and the circuit actions written anywhere in src/. */
  function writtenActions(): Set<string> {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const found = new Set<string>();
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== "generated") walk(path);
        } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const source = readFileSync(path, "utf8");
          for (const match of source.matchAll(/["'](SAMPLE_[A-Z_]+)["']/g)) {
            // A status-like constant named in a comparison is not an action.
            if (/action\s*:|\?\s*$|AUDIT_ACTIONS/.test(source.slice(Math.max(0, match.index - 80), match.index))) found.add(match[1]);
          }
        }
      }
    };
    walk(root);
    return found;
  }

  it("labels every SAMPLE_* action the code writes (an unlabelled one would be missing from the parcours)", () => {
    const missing = [...writtenActions()].filter((action) => !(action in TIMELINE_ACTIONS));
    expect(missing).toEqual([]);
  });

  it("includes the steps named by the plan", () => {
    for (const action of [
      "RESULTS_SUBMITTED",
      "REPORT_SENT",
      "REPORT_AMENDED",
      "REPORT_REOPENED",
      "CONTAMINATION_ALERT_SENT",
      "SAMPLE_REJECTED",
      "SAMPLE_RECEIVED",
      "SAMPLE_APPROVED",
    ]) {
      expect(TIMELINE_ACTION_CODES, action).toContain(action);
    }
  });
});
