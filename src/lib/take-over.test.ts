import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TAKE_MESSAGES, benchHidesClient, benchSearchScope, benchWhereFor, type TakeState } from "./bench-access";
import { BLIND_BENCH_SCREENS, TAKE_OVER_COLLEAGUE } from "./lab-proposals";
import { formatDateTime } from "./labels";
import { SAMPLE_BENCH_SELECT, SAMPLE_LAB_SELECT } from "./sample-select";
import { sampleTimeline, type TimelineSample } from "./sample-timeline";
import { groupBySerie } from "./serie-groups";
import {
  HOLDER_ACTIONS,
  TAKE_OVER_MESSAGES,
  currentTakeOver,
  enteredByText,
  lostSampleHolder,
  takeOverConfirmation,
  takeOverRefusal,
  takeStateOf,
  type HolderRow,
} from "./take-over";

/**
 * The bench side of the re-ask of 18/10, built on our proposals behind
 * their switches (`lab-proposals.ts`): « Reprendre » a colleague's sample
 * (2.13, C3), « Saisi par » at the bench (D-09), and the technician's
 * screens without the client (2.15, C2).
 */

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8").replace(/\r\n/g, "\n");

const tech1 = { id: "tech1", role: "TECHNICIEN" as const };
const tech2 = { id: "tech2", role: "TECHNICIEN" as const };
const admin = { id: "adm", role: "ADMIN" as const };

const state = (over: Partial<TakeState> = {}): TakeState => ({
  status: "EN_ANALYSE",
  analysisBlocked: false,
  technicianId: "tech1",
  holderName: "Technicien A",
  heldByParameter: false,
  ...over,
});

describe("the switches — our proposals, ON until the laboratory answers otherwise", () => {
  it("ships both bench proposals on", () => {
    expect(TAKE_OVER_COLLEAGUE).toBe(true);
    expect(BLIND_BENCH_SCREENS).toBe(true);
  });
});

describe("takeOverRefusal — « Reprendre » a colleague's sample (2.13, C3)", () => {
  it("lets any technician take over a sample a colleague holds on the bench, no reason asked", () => {
    expect(takeOverRefusal(state(), tech2, true)).toBeNull();
    expect(takeOverRefusal(state({ status: "PROGRAMME" }), tech2, true)).toBeNull();
  });

  it("answers the holder's own click as done, not as a refusal", () => {
    expect(takeOverRefusal(state(), tech1, true)).toBeNull();
  });

  it("is closed when the switch is off (the colleague's sample read-only, as before)", () => {
    expect(takeOverRefusal(state(), tech2, false)).toEqual({ status: 403, error: TAKE_OVER_MESSAGES.disabled });
  });

  it("is a technician's gesture: the admin stands in without taking", () => {
    expect(takeOverRefusal(state(), admin, true)).toEqual({ status: 403, error: TAKE_OVER_MESSAGES.technicianOnly });
  });

  it("sends a free sample to « Prendre en charge »", () => {
    expect(takeOverRefusal(state({ technicianId: null, holderName: null }), tech2, true)).toEqual({
      status: 409,
      error: TAKE_OVER_MESSAGES.free,
    });
  });

  it("leaves a line split parameter by parameter before 13/10 to an administrator", () => {
    const legacy = { status: 409, error: TAKE_OVER_MESSAGES.legacy };
    expect(takeOverRefusal(state({ technicianId: null, heldByParameter: true }), tech2, true)).toEqual(legacy);
    expect(takeOverRefusal(state({ heldByParameter: true }), tech2, true)).toEqual(legacy);
  });

  it("never sends a free sample off the bench or held at reception to « Prendre en charge »", () => {
    expect(takeOverRefusal(state({ technicianId: null, holderName: null, status: "ANNULE" }), tech2, true)).toEqual({
      status: 409,
      error: TAKE_OVER_MESSAGES.offBench,
    });
    expect(takeOverRefusal(state({ technicianId: null, holderName: null, status: "VALIDE" }), tech2, true)).toEqual({
      status: 409,
      error: TAKE_OVER_MESSAGES.offBench,
    });
    expect(takeOverRefusal(state({ technicianId: null, holderName: null, analysisBlocked: true }), tech2, true)).toEqual({
      status: 409,
      error: TAKE_MESSAGES.blocked,
    });
    // A legacy split line that left the bench is told so, not sent to the admin.
    expect(takeOverRefusal(state({ heldByParameter: true, status: "RESULTATS_SAISIS" }), tech2, true)).toEqual({
      status: 409,
      error: TAKE_OVER_MESSAGES.offBench,
    });
  });

  it("refuses a sample off the bench, held at reception, or missing", () => {
    expect(takeOverRefusal(state({ status: "RESULTATS_SAISIS" }), tech2, true)).toEqual({
      status: 409,
      error: TAKE_OVER_MESSAGES.offBench,
    });
    expect(takeOverRefusal(state({ status: "VALIDE" }), tech2, true)?.status).toBe(409);
    expect(takeOverRefusal(state({ analysisBlocked: true }), tech2, true)).toEqual({
      status: 409,
      error: TAKE_MESSAGES.blocked,
    });
    expect(takeOverRefusal(null, tech2, true)?.status).toBe(404);
  });

  it("reads the switch by default", () => {
    expect(takeOverRefusal(state(), tech2)).toEqual(takeOverRefusal(state(), tech2, TAKE_OVER_COLLEAGUE));
  });
});

describe("takeStateOf — the sheet reads the rule the route applies", () => {
  it("names the holder and sees a legacy parameter technician", () => {
    const sample = {
      status: "EN_ANALYSE" as const,
      analysisBlocked: false,
      technicianId: "tech1",
      technician: { name: "Technicien A" },
      parameters: [{ technicianId: null }, { technicianId: null }],
    };
    expect(takeStateOf(sample)).toEqual(state());
    expect(takeStateOf({ ...sample, parameters: [{ technicianId: "tech3" }] }).heldByParameter).toBe(true);
    expect(takeStateOf({ ...sample, technicianId: null, technician: null }).holderName).toBeNull();
  });
});

describe("currentTakeOver — « Repris à A », « Repris par B »", () => {
  const at = (time: string) => new Date(`2026-10-22T${time}:00Z`);
  const row = (action: string, time: string, actorId: string, metadata?: Record<string, unknown>): HolderRow => ({
    action,
    actorId,
    createdAt: at(time),
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
  const over = row("SAMPLE_TAKEN_OVER", "10:00", "tech2", {
    previousTechnicianId: "tech1",
    previousTechnicianName: "Technicien A",
    typedResults: 2,
  });

  it("reads the take-over the current holder holds the sample by", () => {
    expect(currentTakeOver([row("SAMPLE_TAKEN", "09:00", "tech1"), over], "tech2")).toEqual({
      at: at("10:00"),
      previousTechnicianId: "tech1",
      previousTechnicianName: "Technicien A",
    });
  });

  it("says nothing once the holder changed again, or of a plain take", () => {
    expect(currentTakeOver([over, row("SAMPLE_TAKEN_OVER", "11:00", "tech1", { previousTechnicianId: "tech2" })], "tech2")).toBeNull();
    expect(currentTakeOver([over, row("SAMPLE_UNTAKEN", "11:00", "tech2"), row("SAMPLE_TAKEN", "11:05", "tech2")], "tech2")).toBeNull();
    expect(currentTakeOver([row("SAMPLE_TAKEN", "09:00", "tech1")], "tech1")).toBeNull();
    expect(currentTakeOver([over], null)).toBeNull();
    expect(currentTakeOver([], "tech2")).toBeNull();
  });

  it("survives a journal row without its metadata", () => {
    expect(currentTakeOver([row("SAMPLE_TAKEN_OVER", "10:00", "tech2")], "tech2")).toEqual({
      at: at("10:00"),
      previousTechnicianId: null,
      previousTechnicianName: null,
    });
    expect(currentTakeOver([{ ...over, metadata: "{oops" }], "tech2")?.previousTechnicianName).toBeNull();
  });

  it("asks the journal for the three bench actions only", () => {
    expect([...HOLDER_ACTIONS]).toEqual(["SAMPLE_TAKEN", "SAMPLE_UNTAKEN", "SAMPLE_TAKEN_OVER"]);
  });
});

describe("takeOverConfirmation — what the one who takes over is told", () => {
  it("names the holder, keeps the saved readings with their author, warns of their unsaved typing", () => {
    const text = takeOverConfirmation("Technicien A");
    expect(text).toContain("Reprendre cet échantillon à Technicien A ?");
    expect(text).toContain("chacun au nom de la personne qui l'a saisi");
    expect(text).toContain("vous terminez la saisie et soumettez l'échantillon");
    expect(text).toContain(
      "Ce que Technicien A n'a pas encore enregistré ne sera pas gardé : pensez à prévenir Technicien A."
    );
    // No pronoun: the holder is a named colleague of either gender.
    expect(text).not.toMatch(/prévenez-l[ea]/);
  });
});

describe("lostSampleHolder — the refusals that mean « the sample is no longer mine »", () => {
  it("reads the colleague's name in a take-over's refusal (403) and a take during the save (409)", () => {
    expect(lostSampleHolder(TAKE_MESSAGES.heldByOther("Technicien B"))).toBe("Technicien B");
    expect(lostSampleHolder(TAKE_MESSAGES.takenBy("Technicien B"))).toBe("Technicien B");
    // The PUT's own spelling of the take during the save, and its fallback.
    expect(lostSampleHolder("Déjà pris par un collègue.")).toBe("un collègue");
  });

  it("leaves every other refusal to the sheet's refresh, as before", () => {
    for (const message of [
      "Le paramètre E. coli est réservé à Technicien C : vous ne pouvez pas le saisir.",
      "Le programme d'analyse de cet échantillon a changé : rechargez la fiche.",
      "Accès refusé.",
      TAKE_MESSAGES.submitUnclaimed,
      TAKE_MESSAGES.blocked,
      "",
    ]) {
      expect(lostSampleHolder(message)).toBeNull();
    }
    // A message cut before the name is not a holder.
    expect(lostSampleHolder("Déjà pris par .")).toBeNull();
  });
});

describe("enteredByText — « Saisi par » at the bench (D-09)", () => {
  const monday = new Date("2026-10-19T08:30:00Z");
  const result = { value: "1,2.10²", enteredBy: { name: "Technicien A" }, enteredAt: monday, units: [] };

  it("names whoever typed the stored reading, with the validation page's words", () => {
    expect(enteredByText(result)).toBe(`Saisi par Technicien A le ${formatDateTime(monday)}`);
    expect(enteredByText({ ...result, value: null, units: [{ unitIndex: 1 }] })).toBe(
      `Saisi par Technicien A le ${formatDateTime(monday)}`
    );
  });

  it("names nobody on a line left empty, unsaved, or without an author", () => {
    expect(enteredByText({ ...result, value: null })).toBeNull();
    expect(enteredByText({ ...result, value: "" })).toBeNull();
    expect(enteredByText({ ...result, enteredBy: null })).toBeNull();
    expect(enteredByText({ ...result, enteredAt: null })).toBeNull();
    expect(enteredByText(undefined)).toBeNull();
    expect(enteredByText(null)).toBeNull();
  });
});

describe("the parcours — « Repris à un collègue — par B — était pris par A »", () => {
  const at = (time: string) => new Date(`2026-10-22T${time}:00Z`);
  const sample: TimelineSample = {
    sampledAt: at("06:00"),
    receivedAt: null,
    receivedBy: null,
    programmedAt: null,
    programmedBy: null,
    // A's take at 09:00, the start of the analyses: the take-over moves the
    // holder only, its journal row is its step.
    assignedAt: at("09:00"),
    technician: { name: "Technicien B" },
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

  it("shows the take-over with its author and the previous holder, never a separate assignment", () => {
    const events = sampleTimeline(sample, [
      { id: "r1", action: "SAMPLE_TAKEN", createdAt: at("09:00"), actor: { name: "Technicien A" }, metadata: null },
      {
        id: "r2",
        action: "SAMPLE_TAKEN_OVER",
        createdAt: at("10:00"),
        actor: { name: "Technicien B" },
        metadata: JSON.stringify({ previousTechnicianName: "Technicien A", typedResults: 2 }),
      },
    ]);
    expect(events.map((event) => event.label)).toEqual(["Prélèvement", "Pris en charge", "Repris à un collègue"]);
    const takeOver = events[2];
    expect(takeOver.actor).toBe("Technicien B");
    expect(takeOver.note).toBe("Était pris par Technicien A — 2 résultats déjà saisis, gardés au nom de leur auteur");
  });

  it("names the technician assigned before 13/10, not the one who took it over since", () => {
    // Assigned by the programme on 01/10 (no take row), taken over by B on 22/10.
    const legacy = { ...sample, assignedAt: new Date("2026-10-01T08:00:00Z") };
    const events = sampleTimeline(legacy, [
      {
        id: "r5",
        action: "SAMPLE_TAKEN_OVER",
        createdAt: at("10:00"),
        actor: { name: "Technicien B" },
        metadata: JSON.stringify({ previousTechnicianName: "Technicien A", typedResults: 0 }),
      },
    ]);
    const assigned = events.find((event) => event.label === "Attribué à un technicien");
    expect(assigned?.note).toBe("Technicien : Technicien A");
    // Without a take-over, the current holder is the one assigned.
    const plain = sampleTimeline({ ...legacy, technician: { name: "Technicien A" } }, []);
    expect(plain.find((event) => event.label === "Attribué à un technicien")?.note).toBe("Technicien : Technicien A");
  });

  it("agrees with one reading saved", () => {
    const [, , event] = sampleTimeline(sample, [
      { id: "t0", action: "SAMPLE_TAKEN", createdAt: at("09:00"), actor: { name: "Technicien A" }, metadata: null },
      {
        id: "r4",
        action: "SAMPLE_TAKEN_OVER",
        createdAt: at("10:00"),
        actor: { name: "Technicien B" },
        metadata: JSON.stringify({ previousTechnicianName: "Technicien A", typedResults: 1 }),
      },
    ]);
    expect(event.note).toBe("Était pris par Technicien A — 1 résultat déjà saisi, gardé au nom de son auteur");
  });

  it("says nothing of readings when none were saved", () => {
    const [, , event] = sampleTimeline(sample, [
      { id: "t0", action: "SAMPLE_TAKEN", createdAt: at("09:00"), actor: { name: "Technicien A" }, metadata: null },
      {
        id: "r3",
        action: "SAMPLE_TAKEN_OVER",
        createdAt: at("10:00"),
        actor: { name: "Technicien B" },
        metadata: JSON.stringify({ previousTechnicianName: "Technicien A", typedResults: 0 }),
      },
    ]);
    expect(event.note).toBe("Était pris par Technicien A");
  });
});

describe("benchHidesClient — the technician's screens without the client (2.15, C2)", () => {
  it("hides the client from the technician only, while the switch is on", () => {
    expect(benchHidesClient("TECHNICIEN", true)).toBe(true);
    for (const role of ["ADMIN", "VALIDATEUR", "DIRECTION", "RECEPTIONNISTE", "PROGRAMMATEUR"] as const) {
      expect(benchHidesClient(role, true)).toBe(false);
    }
    expect(benchHidesClient("TECHNICIEN", false)).toBe(false);
    expect(benchHidesClient("TECHNICIEN")).toBe(BLIND_BENCH_SCREENS);
  });

  it("groups a blind bench by série with no client name", () => {
    const items = [
      { id: "a", serie: { serialNumber: "9/26" } },
      { id: "b", serie: { serialNumber: "9/26" } },
    ];
    expect(groupBySerie(items)).toEqual([{ serialNumber: "9/26", clientName: null, items }]);
  });
});

describe("SAMPLE_BENCH_SELECT — the technician's list API without the client (2.15)", () => {
  it("drops the client, the site and the client's place, keeps the laboratory view", () => {
    expect(SAMPLE_BENCH_SELECT.client).toBe(false);
    expect(SAMPLE_BENCH_SELECT.lieu).toBe(false);
    expect(SAMPLE_BENCH_SELECT.serie.select.site).toBe(false);
    expect(SAMPLE_BENCH_SELECT.serie.select.serialNumber).toBe(true);
    expect(SAMPLE_BENCH_SELECT.controlCode).toBe(true);
    expect(SAMPLE_BENCH_SELECT.technician).toEqual(SAMPLE_LAB_SELECT.technician);
    const text = JSON.stringify(SAMPLE_BENCH_SELECT);
    expect(text).not.toMatch(/"(client|site|lieu)":(true|\{)/);
  });
});

describe("benchSearchScope — the technician's search (2.15)", () => {
  it("keeps every other role's search whole", () => {
    expect(benchSearchScope(admin, "TEST UI", true)).toBeUndefined();
    expect(benchSearchScope({ id: "v", role: "VALIDATEUR" }, null, true)).toBeUndefined();
  });

  it("keeps the technician on what they hold, a search without text unchanged", () => {
    expect(benchSearchScope(tech1, null, true)).toEqual(benchWhereFor(tech1));
    expect(benchSearchScope(tech1, "TEST UI", false)).toEqual(benchWhereFor(tech1));
  });

  it("never lets the free text match the client, the site or the client's place alone", () => {
    const scope = benchSearchScope(tech1, "TEST UI", true);
    expect(scope).toEqual({
      AND: [
        benchWhereFor(tech1),
        {
          OR: [
            { code: { contains: "TEST UI" } },
            { controlCode: { contains: "TEST UI" } },
            { serialNumber: { contains: "TEST UI" } },
            { serie: { serialNumber: { contains: "TEST UI" } } },
            { produit: { contains: "TEST UI" } },
            { numeroLot: { contains: "TEST UI" } },
          ],
        },
      ],
    });
    const text = JSON.stringify(scope);
    expect(text).not.toContain("client");
    expect(text).not.toContain("site");
    expect(text).not.toContain("lieu");
  });
});

describe("the bench screens read these rules", () => {
  it("PATCH /take: under the row lock, guarded by the holder confirmed, readings untouched, journalled", () => {
    const route = read("../app/api/samples/[id]/take/route.ts");
    const patch = route.slice(route.indexOf("export async function PATCH"), route.indexOf("export async function DELETE"));
    expect(patch).toContain('requireApiRole("TECHNICIEN")');
    expect(patch.indexOf("lockTakeState(tx, id)")).toBeGreaterThan(-1);
    expect(patch.indexOf("takeOverRefusal(state, session)")).toBeGreaterThan(patch.indexOf("lockTakeState(tx, id)"));
    // The holder the confirmation named: required, compared under the lock
    // (after « already », a double click), and guarding the UPDATE itself.
    expect(patch).toContain('typeof body.holderId === "string"');
    expect(patch).toContain('if (!expected) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });');
    const already = patch.indexOf('return { done: "already", state };');
    const mismatch = patch.indexOf(
      "if (state.technicianId !== expected) return { refusal: { status: 409, error: TAKE_OVER_MESSAGES.changed } };"
    );
    expect(already).toBeGreaterThan(-1);
    expect(mismatch).toBeGreaterThan(already);
    expect(patch).toContain("technicianId: expected,");
    expect(patch).not.toContain("technicianId: state.technicianId,");
    // Only the holder moves: `assignedAt` is the report's « Date d'analyse ».
    expect(patch).toContain("data: { technicianId: session.id },");
    expect(patch).not.toContain("assignedAt");
    expect(patch).toContain("tx.sample.updateMany(");
    expect(patch).not.toContain("tx.result.update");
    expect(patch).not.toContain("tx.result.delete");
    expect(patch).toContain('action: "SAMPLE_TAKEN_OVER"');
    expect(patch).toContain("previousTechnicianName: outcome.state.holderName,");
    expect(patch).toContain("typedResults: outcome.typedResults ?? 0,");
  });

  it("the sheet: « Saisi par » per reading, the take-over button, no client on a blind bench", () => {
    const page = read("../app/technicien/[id]/page.tsx");
    expect(page).toContain("enteredBy: { select: { name: true } }");
    expect(page).toContain("enteredBy: enteredByText(existing),");
    expect(page).toContain("takeOverRefusal(takeStateOf(sample), session)");
    expect(page).toContain("<TakeOverButton");
    // The button names the holder shown, and sends it.
    expect(page).toContain("holderId={sample.technicianId}");
    const buttons = read("../components/technicien/BenchTakeActions.tsx");
    expect(buttons).toContain('callTake(sampleId, "PATCH", { holderId })');
    // « Pris par B le … » dates the take-over, never a moved `assignedAt`.
    expect(page).toContain("const takenAt = takenOver?.at ?? sample.assignedAt;");
    expect(page.indexOf("const takenOver = currentTakeOver(")).toBeLessThan(page.indexOf("const takenAt = "));
    // The client is never selected with the sample, and loaded only for a viewer who reads it.
    expect(page).not.toMatch(/\n\s+client: \{ select: \{ name: true \} \},/);
    expect(page).toContain("blind ? null : prisma.client.findUnique(");
    // Nor the client's place, which the sheet never shows.
    expect(page).not.toMatch(/\n\s+lieu: true,/);
    expect(page).toContain("<ReceptionNonConformity sample={sample} blind={blind} />");
    const form = read("../components/technicien/ResultEntryForm.tsx");
    expect(form).toContain("authors.get(line.parameterId)");
  });

  it("the sheet's refusals: only « no longer mine » keeps the typing, saved or not; any other 403 re-renders", () => {
    const form = read("../components/technicien/ResultEntryForm.tsx");
    const refused = form.slice(form.indexOf("function refused("), form.indexOf("async function save("));
    expect(refused).toContain("const holder = lostSampleHolder(message);");
    expect(refused).toContain("setRevoked({ holder, saved });");
    expect(refused).toContain("if (status === 403 || status === 409) router.refresh();");
    // Every 403 used to freeze the sheet with the take-over's words.
    expect(refused).not.toContain('message.startsWith("Déjà pris par ")');
    expect(form).toContain('refused(response.status, data.error ?? "Impossible de soumettre les résultats.", true);');
    expect(form).toContain("Vos résultats ont été enregistrés à votre nom, mais l'échantillon n'a pas été soumis");
    // The two refusals it reads come from the take messages.
    expect(read("./sample-access.ts")).toContain("TAKE_MESSAGES.heldByOther(holder)");
    expect(read("../app/api/samples/[id]/results/submit/route.ts")).toContain("TAKE_MESSAGES.heldByOther(");
    expect(read("../app/api/samples/[id]/results/route.ts")).toContain(
      '{ error: `Déjà pris par ${written.holderName ?? "un collègue"}.` }'
    );
  });

  it("the list API: a blind technician neither filters by, matches nor reads the client", () => {
    const route = read("../app/api/samples/route.ts");
    expect(route).toContain("const blind = benchHidesClient(session.role);");
    expect(route).toContain("blind ? { ...parsed, clientId: null, siteId: null } : parsed");
    expect(route).toContain("AND: [benchSearchScope(session, search.q)!]");
    expect(route).toContain("select: blind ? SAMPLE_BENCH_SELECT : sampleSelectFor(session.role),");
    expect(route).not.toContain("benchWhereFor(");
  });

  it("the bench lists: a blind select without the client", () => {
    const page = read("../app/technicien/page.tsx");
    const blindSelect = page.slice(page.indexOf("const BLIND_WORK_ITEM_SELECT"), page.indexOf("const WORK_ITEM_SELECT"));
    expect(blindSelect).not.toContain("client: {");
    expect(page).toContain("const blind = benchHidesClient(session.role);");
    expect(page).toContain("select: BLIND_WORK_ITEM_SELECT");
  });

  it("the bench lists: « Repris par B · <time> » dated by the journal, not by `assignedAt`", () => {
    const page = read("../app/technicien/page.tsx");
    expect(page).toContain("currentTakeOversOf(rows),");
    expect(page).toContain("takenOverAt: takeOvers.get(item.id)?.at ?? null,");
    const queue = read("../components/technicien/WorkQueue.tsx");
    expect(queue).toContain("`Repris par ${holder} · ${formatDateTime(item.takenOverAt)}`");
    const server = read("./take-over-server.ts");
    expect(server).toContain("currentTakeOver(bySample.get(sample.id) ?? [], sample.technicianId)");
  });

  it("the search: no client column, filter or text match for a blind technician", () => {
    const page = read("../app/recherche/page.tsx");
    expect(page).toContain("const blind = benchHidesClient(session.role);");
    expect(page).toContain("blind ? { ...parsed, clientId: null, siteId: null } : parsed");
    expect(page).toContain("scope: benchSearchScope(session, search.q),");
    // …nor loads them: `searchSamples` reads neither the client, the site nor the place.
    expect(page).toMatch(/scope: benchSearchScope\(session, search\.q\),\n\s+blind,\n/);
    const loader = read("./sample-search-server.ts");
    const blindSelect = loader.slice(loader.indexOf("const BLIND_SEARCH_SELECT"), loader.indexOf("type SearchSample"));
    expect(blindSelect).toContain("client: false,");
    expect(blindSelect).toContain("lieu: false,");
    expect(blindSelect).toContain("site: false");
    expect(loader).toContain("? prisma.sample.findMany({ ...page, select: BLIND_SEARCH_SELECT })");
    expect(page).toContain('{!blind && <th className="pb-2 pr-3 font-medium">Client</th>}');
    expect(page).toContain("{!blind && (\n            <ClientSiteFilter");
  });
});

describe("blind bench — the client list (production recette 24/10)", () => {
  it("GET /api/clients refuses a technician while the bench is blind", () => {
    const source = readFileSync(`${process.cwd()}/src/app/api/clients/route.ts`, "utf8");
    const get = source.slice(source.indexOf("export async function GET"));
    expect(get).toMatch(/if \(benchHidesClient\(session\.role\)\) \{\s*return NextResponse\.json\(\{ error: "Accès refusé\." \}, \{ status: 403 \}\);/);
    expect(get.indexOf("benchHidesClient")).toBeLessThan(get.indexOf("searchParams"));
  });
});
