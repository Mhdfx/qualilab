import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONSULTATION_EDIT_MESSAGES,
  consultationChanges,
  consultationEditRefusal,
  consultationEditable,
  consultationRecord,
} from "./client-consultation";
import { CONSULTATION_AFTER_RECEPTION } from "./lab-proposals";

const nonConform = { status: "PROGRAMME", conformity: false, analysisBlocked: false, validatedById: null };

describe("consultationEditRefusal (I6, Q75 — R-8)", () => {
  it("is on by default", () => {
    expect(CONSULTATION_AFTER_RECEPTION).toBe(true);
  });

  it("lets the reception and the administrator add or correct it on a received non-conform sample", () => {
    for (const status of ["RECU", "PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"]) {
      expect(consultationEditRefusal("RECEPTIONNISTE", { ...nonConform, status })).toBeNull();
      expect(consultationEditRefusal("ADMIN", { ...nonConform, status })).toBeNull();
    }
    expect(consultationEditable(nonConform)).toBe(true);
  });

  it("refuses every other role", () => {
    for (const role of ["PRELEVEUR", "TECHNICIEN", "PROGRAMMATEUR", "VALIDATEUR", "DIRECTION", "GESTIONNAIRE", "COMPTABLE", "CLIENT"]) {
      expect(consultationEditRefusal(role, nonConform)).toEqual({ status: 403, error: CONSULTATION_EDIT_MESSAGES.role });
    }
  });

  it("refuses a conform sample, a held one, one validated or cancelled", () => {
    expect(consultationEditRefusal("ADMIN", { ...nonConform, conformity: true })?.error).toBe(CONSULTATION_EDIT_MESSAGES.conform);
    expect(consultationEditRefusal("ADMIN", { ...nonConform, conformity: null })?.error).toBe(CONSULTATION_EDIT_MESSAGES.conform);
    expect(consultationEditRefusal("ADMIN", { ...nonConform, status: "RECU", analysisBlocked: true })?.error).toBe(CONSULTATION_EDIT_MESSAGES.held);
    expect(consultationEditRefusal("ADMIN", { ...nonConform, status: "RESULTATS_SAISIS", validatedById: "v1" })?.error).toBe(
      CONSULTATION_EDIT_MESSAGES.validated
    );
    for (const status of ["PRELEVE", "VALIDE", "RAPPORT_ENVOYE", "ANNULE"]) {
      expect(consultationEditRefusal("ADMIN", { ...nonConform, status })).toEqual({ status: 409, error: CONSULTATION_EDIT_MESSAGES.status });
    }
    expect(consultationEditable({ ...nonConform, status: "VALIDE" })).toBe(false);
  });
});

describe("consultationChanges", () => {
  const row = {
    clientConsultedName: "M. Exemple",
    clientConsultationChannel: "TELEPHONE" as const,
    clientConsultedAt: new Date("2026-10-30T10:00:00Z"),
    clientConsultationNote: null,
  };

  it("keeps the agreement as the journal writes it", () => {
    expect(consultationRecord(row)).toEqual({ name: "M. Exemple", channel: "TELEPHONE", at: "2026-10-30T10:00:00.000Z", note: null });
    expect(consultationRecord({ ...row, clientConsultedAt: "2026-10-30T10:00:00.000Z" }).at).toBe("2026-10-30T10:00:00.000Z");
  });

  it("names the fields that changed, none when nothing did", () => {
    const before = consultationRecord(row);
    expect(consultationChanges(before, before)).toEqual([]);
    expect(consultationChanges(before, { ...before, channel: "EMAIL", note: "Confirmé par courriel" })).toEqual(["channel", "note"]);
    expect(consultationChanges(consultationRecord({ ...row, clientConsultedName: null, clientConsultationChannel: null, clientConsultedAt: null }), before)).toEqual([
      "name",
      "channel",
      "at",
    ]);
  });
});

describe("PUT /api/samples/[id]/consultation", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/samples/[id]/consultation/route.ts"), "utf8");

  it("is guarded server-side for the reception and the administrator, behind its switch", () => {
    expect(route).toMatch(/if \(!CONSULTATION_AFTER_RECEPTION\) return NextResponse\.json\(\{ error: "Introuvable\." \}, \{ status: 404 \}\)/);
    expect(route).toMatch(/requireApiRole\("RECEPTIONNISTE", "ADMIN"\)/);
    expect(route).toMatch(/consultationEditRefusal\(session\.role, sample\)/);
  });

  it("re-checks the state in the UPDATE and journals before → after", () => {
    expect(route).toMatch(/updateMany\(\{\s*where: \{\s*id: sample\.id,\s*status: \{ in: \[\.\.\.CONSULTATION_EDITABLE_STATUSES\] \},\s*conformity: false,\s*analysisBlocked: false,\s*validatedById: null,/);
    expect(route).toMatch(/action: "CLIENT_CONSULTATION_UPDATED"/);
    expect(route).toMatch(/before,\s*after,/);
  });
});
