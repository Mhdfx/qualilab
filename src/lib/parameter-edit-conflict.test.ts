import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOCK_RETRIES } from "./billing";
import {
  PARAMETER_CHANGED_ERROR,
  PARAMETER_PAGE_OUTDATED_ERROR,
  parameterVersion,
  type CleanParameter,
} from "./parameter-validation";

/**
 * An edit made on a stale copy (open point of D-19): an administrator whose
 * single-parameter form was opened before « Reclasser plusieurs paramètres »
 * sent the old domain back and silently undid the reclassification. The
 * route handler runs here for real; the database (and its transaction), the
 * session guard, the journal and the reads of the reclassification rule are
 * stubbed, and what the handler is asked to write is checked.
 */

const stubs = vi.hoisted(() => {
  // The transaction client: the row lock, the read under it, the write.
  const tx = {
    $queryRaw: vi.fn(),
    analysisParameter: { findUnique: vi.fn(), updateMany: vi.fn() },
  };
  return {
    tx,
    prisma: {
      $transaction: vi.fn(),
      analysisParameter: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    },
    logAudit: vi.fn(),
    loadReclassifyContext: vi.fn(),
    session: { current: null as null | Record<string, unknown> },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: stubs.prisma }));
vi.mock("@/lib/audit", () => ({ logAudit: stubs.logAudit }));
vi.mock("@/lib/auth", () => ({ requireApiRole: async () => stubs.session.current }));
vi.mock("@/lib/parameter-reclassify-store", () => ({ loadReclassifyContext: stubs.loadReclassifyContext }));
// No pause between the rounds of a lock lost: the same rounds, at once.
vi.mock("@/lib/billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./billing")>()),
  lockRetryPause: () => 0,
}));

import { PATCH } from "../app/api/parameters/[id]/route";

const ADMIN = { id: "u-admin", username: "admin", name: "Administrateur", role: "ADMIN" };
const BUSY_ERROR = "Une autre opération sur ce paramètre était en cours. Rien n'a été enregistré : réessayez.";

type StoredRow = CleanParameter & { id: string };

/** The row as the screen opened it: filed MICRO by the reprise. */
const OPENED: StoredRow = {
  id: "p-plomb",
  name: "TEST UI V18 Plomb",
  category: "ALIMENTAIRE",
  family: "MICRO",
  unit: "mg/kg",
  threshold: "0,1 mg/kg",
  limitValue: 0.1,
  alertOnExceed: false,
  calcFactor: 1,
  aliases: null,
};
/** The same row after « Passer en Physico-chimie ». */
const RECLASSIFIED: StoredRow = { ...OPENED, family: "CHIMIE" };

/** What the form sends: every field as shown, the unit edited. */
function formBody(row: StoredRow, version?: string | null) {
  return {
    name: row.name,
    category: row.category,
    family: row.family,
    unit: "µg/kg",
    threshold: row.threshold ?? "",
    limitValue: row.limitValue === null ? "" : String(row.limitValue),
    alertOnExceed: row.alertOnExceed,
    calcFactor: "",
    aliases: row.aliases ?? "",
    ...(version === undefined ? {} : { version }),
  };
}

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/parameters/p-plomb", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "p-plomb" }) }
  );
}

/** The row read first, then under the lock (the same unless said otherwise). */
function stored(row: StoredRow | null, locked: StoredRow | null = row) {
  stubs.prisma.analysisParameter.findUnique.mockResolvedValue(row);
  stubs.tx.analysisParameter.findUnique.mockResolvedValue(locked);
}

/** What InnoDB answers a write that lost a lock race, as Prisma reports it. */
const lockLost = () =>
  Object.assign(new Error("Lock wait timeout exceeded; try restarting transaction"), { code: "P2034" });

/** The fields the guarded write was given. */
const written = () => stubs.tx.analysisParameter.updateMany.mock.calls[0][0].data;

beforeEach(() => {
  vi.resetAllMocks();
  stubs.session.current = ADMIN;
  stubs.prisma.$transaction.mockImplementation(async (fn: (client: typeof stubs.tx) => unknown) => fn(stubs.tx));
  stubs.prisma.analysisParameter.findFirst.mockResolvedValue(null);
  stubs.tx.$queryRaw.mockResolvedValue([{ id: "p-plomb" }]);
  stubs.tx.analysisParameter.updateMany.mockResolvedValue({ count: 1 });
  stubs.loadReclassifyContext.mockResolvedValue({
    natures: (["MICRO", "CHIMIE", "AUTRE"] as const).map((family) => ({ family, legacyType: "ALIMENTAIRE" })),
    profiles: [],
    openSamples: [],
    citedBy: [],
  });
});

describe("PATCH /api/parameters/[id] — a form opened before a reclassification", () => {
  it("is refused (409) and writes nothing: the reclassification stays", async () => {
    stored(RECLASSIFIED);
    const response = await patch(formBody(OPENED, parameterVersion(OPENED)));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: PARAMETER_CHANGED_ERROR, current: RECLASSIFIED });
    expect(stubs.prisma.$transaction).not.toHaveBeenCalled();
    expect(stubs.tx.analysisParameter.updateMany).not.toHaveBeenCalled();
    expect(stubs.prisma.analysisParameter.update).not.toHaveBeenCalled();
    expect(stubs.logAudit).not.toHaveBeenCalled();
  });

  it("is refused after any other edit too (a limit changed in another tab)", async () => {
    stored({ ...OPENED, limitValue: 0.05 });
    const response = await patch(formBody(OPENED, parameterVersion(OPENED)));
    expect(response.status).toBe(409);
    expect(stubs.tx.analysisParameter.updateMany).not.toHaveBeenCalled();
  });

  it("saves once reloaded: the version of the stored row, its domain kept", async () => {
    stored(RECLASSIFIED);
    const response = await patch(formBody(RECLASSIFIED, parameterVersion(RECLASSIFIED)));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "p-plomb", family: "CHIMIE", unit: "µg/kg" });
    expect(stubs.tx.analysisParameter.updateMany).toHaveBeenCalledTimes(1);
    expect(written()).toMatchObject({ family: "CHIMIE", unit: "µg/kg" });
    expect(stubs.logAudit).toHaveBeenCalledTimes(1);
    expect(stubs.logAudit.mock.calls[0][0]).toMatchObject({
      action: "PARAMETER_UPDATED",
      entityId: "p-plomb",
      metadata: { before: { family: "CHIMIE", unit: "mg/kg" }, after: { family: "CHIMIE", unit: "µg/kg" } },
    });
  });

  it("refuses a version that is not one (400), before anything is written", async () => {
    stored(OPENED);
    const response = await patch({ ...formBody(OPENED), version: { family: "MICRO" } });
    expect(response.status).toBe(400);
    expect(stubs.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/parameters/[id] — the write itself, under the row lock", () => {
  it("locks the row, reads it again, compares its version, then writes it by id and counts", async () => {
    stored(OPENED);
    const response = await patch(formBody(OPENED, parameterVersion(OPENED)));
    expect(response.status).toBe(200);
    const [sql, ...values] = stubs.tx.$queryRaw.mock.calls[0];
    expect(sql.join("?")).toMatch(/SELECT `id` FROM `AnalysisParameter` WHERE `id` = \? FOR UPDATE/);
    expect(values).toEqual(["p-plomb"]);
    const order = [stubs.tx.$queryRaw, stubs.tx.analysisParameter.findUnique, stubs.tx.analysisParameter.updateMany].map(
      (fn) => fn.mock.invocationCallOrder[0]
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(stubs.tx.analysisParameter.findUnique.mock.calls[0][0]).toEqual({ where: { id: "p-plomb" } });
    expect(stubs.tx.analysisParameter.updateMany.mock.calls[0][0].where).toEqual({ id: "p-plomb" });
    // Never outside the transaction, never the read-then-write `update` (HANDOFF §9).
    expect(stubs.prisma.analysisParameter.updateMany).not.toHaveBeenCalled();
    expect(stubs.prisma.analysisParameter.update).not.toHaveBeenCalled();
  });

  // Each pair is equal under utf8mb4_unicode_ci (checked on qlab-local-db):
  // an UPDATE … WHERE on the text would match and undo the correction.
  it.each([
    ["a superscript", { threshold: "102 UFC/g" }, { threshold: "10² UFC/g" }],
    ["the case", { unit: "ufc/g" }, { unit: "UFC/g" }],
    ["an accent", { name: "TEST UI V18 Enterobacteries" }, { name: "TEST UI V18 Entérobactéries" }],
    ["the micro sign for a Greek mu", { unit: "µg/kg" }, { unit: "μg/kg" }],
    ["a trailing space", { unit: "mg/kg" }, { unit: "mg/kg " }],
    ["one alias line", { aliases: "Pb" }, { aliases: "PB" }],
  ])("a correction of %s landing between the read and the write is not undone (409)", async (_label, before, after) => {
    const opened = { ...OPENED, ...before };
    const corrected = { ...opened, ...after };
    stored(opened, corrected);
    const response = await patch(formBody(opened, parameterVersion(opened)));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: PARAMETER_CHANGED_ERROR, current: corrected });
    expect(stubs.tx.analysisParameter.updateMany).not.toHaveBeenCalled();
    expect(stubs.logAudit).not.toHaveBeenCalled();
  });

  it("a reclassification landing between the read and the write gives the same 409, with the stored row", async () => {
    stored(OPENED, RECLASSIFIED);
    const response = await patch(formBody(OPENED, parameterVersion(OPENED)));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: PARAMETER_CHANGED_ERROR, current: RECLASSIFIED });
    expect(stubs.tx.analysisParameter.updateMany).not.toHaveBeenCalled();
    expect(stubs.logAudit).not.toHaveBeenCalled();
  });

  it("a parameter deleted in between answers 404", async () => {
    stored(OPENED, null);
    const response = await patch(formBody(OPENED, parameterVersion(OPENED)));
    expect(response.status).toBe(404);
    expect(stubs.tx.analysisParameter.updateMany).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/parameters/[id] — a lock lost to another write", () => {
  it("runs again, and the next round writes", async () => {
    stored(OPENED);
    stubs.tx.analysisParameter.updateMany.mockRejectedValueOnce(lockLost()).mockResolvedValue({ count: 1 });
    const response = await patch(formBody(OPENED, parameterVersion(OPENED)));
    expect(response.status).toBe(200);
    expect(stubs.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(stubs.logAudit).toHaveBeenCalledTimes(1);
  });

  it("runs again, and meets under the lock the reclassification it waited for: 409 with the stored row", async () => {
    stored(OPENED);
    stubs.tx.analysisParameter.findUnique.mockResolvedValueOnce(OPENED).mockResolvedValue(RECLASSIFIED);
    stubs.tx.analysisParameter.updateMany.mockRejectedValueOnce(lockLost());
    const response = await patch(formBody(OPENED, parameterVersion(OPENED)));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: PARAMETER_CHANGED_ERROR, current: RECLASSIFIED });
    expect(stubs.tx.analysisParameter.updateMany).toHaveBeenCalledTimes(1);
    expect(stubs.logAudit).not.toHaveBeenCalled();
  });

  it("still locked after every round, the row unchanged: 409 « réessayez » without `current` — the form keeps what was typed", async () => {
    stored(OPENED);
    stubs.tx.analysisParameter.updateMany.mockRejectedValue(lockLost());
    const response = await patch(formBody(OPENED, parameterVersion(OPENED)));
    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data).toEqual({ error: BUSY_ERROR });
    expect(data).not.toHaveProperty("current");
    expect(stubs.prisma.$transaction).toHaveBeenCalledTimes(LOCK_RETRIES);
    expect(stubs.logAudit).not.toHaveBeenCalled();
  });

  it("the same when the row lock itself times out (MySQL 1205)", async () => {
    stored(OPENED);
    stubs.tx.$queryRaw.mockRejectedValue(
      Object.assign(new Error("Raw query failed"), { code: "P2010", meta: { code: "1205" } })
    );
    const response = await patch(formBody(OPENED, parameterVersion(OPENED)));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: BUSY_ERROR });
    expect(stubs.tx.analysisParameter.updateMany).not.toHaveBeenCalled();
  });

  it("still locked after every round, the row changed meanwhile: 409 « modifié entre-temps » with the stored row", async () => {
    stubs.prisma.analysisParameter.findUnique.mockResolvedValueOnce(OPENED).mockResolvedValue(RECLASSIFIED);
    stubs.tx.analysisParameter.findUnique.mockResolvedValue(OPENED);
    stubs.tx.analysisParameter.updateMany.mockRejectedValue(lockLost());
    const response = await patch(formBody(OPENED, parameterVersion(OPENED)));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: PARAMETER_CHANGED_ERROR, current: RECLASSIFIED });
  });

  it("any other failure is not taken for a lock: it is thrown, after one round", async () => {
    stored(OPENED);
    stubs.tx.analysisParameter.updateMany.mockRejectedValue(new Error("Connection lost"));
    await expect(patch(formBody(OPENED, parameterVersion(OPENED)))).rejects.toThrow("Connection lost");
    expect(stubs.prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("PATCH /api/parameters/[id] — a field left out keeps its stored value", () => {
  /** A row with every field set, so that losing one shows. */
  const FULL: StoredRow = { ...RECLASSIFIED, alertOnExceed: true, calcFactor: 10, aliases: "Pb\nPlomb total" };
  const fields = Object.fromEntries(Object.entries(FULL).filter(([key]) => key !== "id"));

  it("a domain alone: unit, threshold, limit, factor, alert and aliases stay", async () => {
    stored(FULL);
    const response = await patch({ family: "AUTRE" });
    expect(response.status).toBe(200);
    expect(written()).toEqual({ ...fields, family: "AUTRE" });
  });

  it("a threshold alone changes the threshold and nothing else (the domain left alone)", async () => {
    stored(FULL);
    const response = await patch({ threshold: "0,2 mg/kg" });
    expect(response.status).toBe(200);
    expect(written()).toEqual({ ...fields, threshold: "0,2 mg/kg" });
    const { before, after } = stubs.logAudit.mock.calls[0][0].metadata;
    expect({ ...before, threshold: "0,2 mg/kg" }).toEqual(after);
  });

  it("a field sent empty is emptied — what the screen sends for a cleared field", async () => {
    stored(FULL);
    const response = await patch({ unit: "", aliases: "", calcFactor: "" });
    expect(response.status).toBe(200);
    expect(written()).toEqual({ ...fields, unit: null, aliases: null, calcFactor: 1 });
  });

  it("still meets the domain rule of D-19", async () => {
    stored(RECLASSIFIED);
    stubs.loadReclassifyContext.mockResolvedValue({
      natures: [{ family: "CHIMIE", legacyType: "ALIMENTAIRE" }],
      profiles: [],
      openSamples: [],
      citedBy: [],
    });
    const response = await patch({ family: "AUTRE" });
    expect(response.status).toBe(409);
    expect((await response.json()).error).not.toBe(PARAMETER_CHANGED_ERROR);
    expect(stubs.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/parameters/[id] — a page loaded before the deploy", () => {
  it("the old form (every field, no version) is refused: a reclassification made since is not undone", async () => {
    stored(RECLASSIFIED);
    for (const body of [formBody(OPENED), formBody(OPENED, null)]) {
      const response = await patch(body);
      expect(response.status).toBe(409);
      // No `current`: the old form shows the message in the page banner.
      expect(await response.json()).toEqual({ error: PARAMETER_PAGE_OUTDATED_ERROR });
    }
    expect(stubs.prisma.$transaction).not.toHaveBeenCalled();
    expect(stubs.logAudit).not.toHaveBeenCalled();
  });
});

describe("the screen always sends the version of the row it opened", () => {
  const screen = readFileSync(fileURLToPath(new URL("../components/admin/ParametersManager.tsx", import.meta.url)), "utf8");
  const form = screen.slice(screen.indexOf("function ParameterForm("), screen.indexOf("function Field("));

  it("sends `version` with every edit, computed from the row loaded — never from the live list", () => {
    expect(form).toMatch(/const \[loaded, setLoaded\] = useState\(parameter\);/);
    expect(form).toMatch(/\.\.\.\(loaded \? \{ version: parameterVersion\(loaded\) \} : \{\}\)/);
    expect(form).toMatch(/method: parameter \? "PATCH" : "POST"/);
    // `loaded` is set only at opening and by « Recharger ».
    expect([...form.matchAll(/setLoaded\(/g)]).toHaveLength(1);
    expect(form).not.toMatch(/version: parameterVersion\(parameter/);
  });

  it("shows the 409 in the form and offers « Recharger », which takes the stored row", () => {
    expect(form).toMatch(/response\.status === 409 && data\.current/);
    expect(form).toMatch(/load\(stale\.current\)/);
    expect(form).toMatch(/Recharger/);
    expect(form).toMatch(/disabled=\{saving \|\| !!stale\}/);
  });

  it("says so before the save when the list was refreshed under it (a reclassification here or elsewhere)", () => {
    // The list's row compared with the list's row of the loading, then with the row loaded.
    expect(form).toMatch(/const \[listed, setListed\] = useState/);
    expect(form).toMatch(/listedNow !== listed && listedNow !== parameterVersion\(loaded\)/);
    expect(form).toMatch(/const stale = changed \?\? \(drift \? \{ message: PARAMETER_CHANGED_ERROR, current: drift \} : null\)/);
    expect(form).toMatch(/if \(saving \|\| stale\) return;/);
  });

  it("puts the keyboard on « Recharger » when the save is refused, and on the form once reloaded", () => {
    expect(form).toMatch(/if \(changed\) reloadRef\.current\?\.focus\(\);/);
    expect(form).toMatch(/ref=\{reloadRef\}/);
    expect(form).toMatch(/familyRef\.current\?\.focus\(\)/);
    expect(form).toMatch(/ref=\{familyRef\}/);
  });

  it("keeps the row being edited in the list whatever the filters: the form never vanishes unsaved", () => {
    expect(screen).toMatch(/const shown = searched\.filter\(\(p\) => p\.id === editing \|\| \(inCategory\(p\) && inFamily\(p\)\)\);/);
    // …but « Tout cocher » never ticks it (D-19 procedure: N as the filters say).
    expect(screen).toMatch(/const tickable = rows\.filter\(\(row\) => inCategory\(row\) && inFamily\(row\)\);/);
    expect(screen).toMatch(/toggle\(tickable\.map\(\(row\) => row\.id\), !allTicked\)/);
    expect(screen).not.toMatch(/toggle\(rows\.map/);
  });
});
