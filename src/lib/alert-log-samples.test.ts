import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALERT_JOURNAL_ACTION,
  ALERT_JOURNAL_EXACT_MS,
  ALERT_JOURNAL_WINDOW_MS,
  alertLogSamples,
  alertSubject,
  namedSendId,
  pairAlertSends,
  sameRecipients,
  sampleAlertLookup,
  timeWindows,
  withEarlyAlerts,
  type AlertJournalRow,
  type AlertJournalStore,
  type AlertSend,
  type TimeWindow,
} from "./alert-log-samples";
import { alertEmail } from "./emails/templates";

const t0 = new Date("2026-10-21T09:00:00.000Z").getTime();
const at = (ms: number) => new Date(t0 + ms);

const client = "test-ui@example.com";
const lab = "labo@example.com";

const send = (id: string, ms: number, over: Partial<AlertSend> = {}): AlertSend => ({
  id,
  createdAt: at(ms),
  to: `${client}, ${lab}`,
  status: "SIMULE",
  subject: alertSubject("E. coli"),
  ...over,
});

const row = (sampleId: string | null, ms: number, meta: Record<string, unknown> = {}): AlertJournalRow => ({
  entityId: sampleId,
  createdAt: at(ms),
  metadata: JSON.stringify({ germe: "E. coli", to: [client], status: "SIMULE", ...meta }),
});

describe("sameRecipients — the send's recorded « to » against the alert's recipients", () => {
  it("accepts the recipients alone, or followed by the laboratory in copy", () => {
    expect(sameRecipients(client, [client])).toBe(true);
    expect(sameRecipients(`${client}, ${lab}`, [client])).toBe(true);
    expect(sameRecipients(`a@example.com, b@example.com, ${lab}`, ["a@example.com", "b@example.com"])).toBe(true);
  });

  it("never matches an address by its prefix, nor another list", () => {
    expect(sameRecipients(`${client}, ${lab}`, ["test-ui@example.co"])).toBe(false);
    expect(sameRecipients(`other@example.com, ${lab}`, [client])).toBe(false);
    expect(sameRecipients(`${client}, ${lab}`, [client, "second@example.com"])).toBe(false);
    // A longer list: another recipient before the copy is another alert.
    expect(sameRecipients(`a@example.com, b@example.com, ${lab}`, ["a@example.com"])).toBe(false);
    expect(sameRecipients(client, [])).toBe(false);
  });

  it("follows the 191-character cut of the recorded list", () => {
    const many = Array.from({ length: 12 }, (_, i) => `destinataire${i}@example.com`);
    const recorded = [...many, lab].join(", ").slice(0, 191);
    expect(recorded).toHaveLength(191);
    expect(sameRecipients(recorded, many)).toBe(true);
    // Cut inside the separator before the copy: « xxx…x, » then nothing.
    const long = ["x".repeat(190)];
    const cut = `${long[0]}, ${lab}`.slice(0, 191);
    expect(cut.endsWith(",")).toBe(true);
    expect(sameRecipients(cut, long)).toBe(true);
    expect(sameRecipients(recorded, many.slice(1))).toBe(false);
  });
});

describe("alertLogSamples — which sample an alert sent before its report was about", () => {
  it("pairs a send with the row that names it (since 21/10)", () => {
    const paired = alertLogSamples([send("log-1", 0)], [row("sample-A", 30, { emailLogId: "log-1" })]);
    expect(paired.get("log-1")).toBe("sample-A");
  });

  it("an exact row wins over a nearer unnamed one, and never stands for another send", () => {
    const paired = alertLogSamples(
      [send("log-1", 0), send("log-2", 5)],
      [row("sample-B", 10), row("sample-A", 40, { emailLogId: "log-1" })]
    );
    expect(paired.get("log-1")).toBe("sample-A");
    expect(paired.get("log-2")).toBe("sample-B");
    // A row naming a send not on the page pairs with nothing here.
    expect(alertLogSamples([send("log-3", 0)], [row("sample-C", 20, { emailLogId: "elsewhere" })]).size).toBe(0);
  });

  it("before the exact link: the journal row written just after the send", () => {
    const paired = alertLogSamples([send("log-1", 0)], [row("sample-A", 24)]);
    expect(paired.get("log-1")).toBe("sample-A");
  });

  it("two germs of one sample: each send its own row, in time order", () => {
    const paired = alertLogSamples(
      [send("log-2", 300, { subject: alertSubject("Salmonella") }), send("log-1", 0)],
      [row("sample-A", 320, { germe: "Salmonella" }), row("sample-A", 15)]
    );
    expect(paired.get("log-1")).toBe("sample-A");
    expect(paired.get("log-2")).toBe("sample-A");
  });

  it("two samples of one client alerted a moment apart keep their own sample", () => {
    const paired = alertLogSamples(
      [send("log-A", 0), send("log-B", 2)],
      [row("sample-A", 18), row("sample-B", 21)]
    );
    expect(paired.get("log-A")).toBe("sample-A");
    expect(paired.get("log-B")).toBe("sample-B");
  });

  it("needs the same status and the same recipients", () => {
    expect(alertLogSamples([send("log-1", 0, { status: "ECHEC" })], [row("sample-A", 20)]).size).toBe(0);
    expect(alertLogSamples([send("log-1", 0, { to: `other@example.com, ${lab}` })], [row("sample-A", 20)]).size).toBe(0);
    // A failed send is paired with its failed row.
    const failed = alertLogSamples([send("log-1", 0, { status: "ECHEC" })], [row("sample-A", 20, { status: "ECHEC" })]);
    expect(failed.get("log-1")).toBe("sample-A");
  });

  it("never reaches a row written before the send, or after the window", () => {
    expect(alertLogSamples([send("log-1", 0)], [row("sample-A", -1)]).size).toBe(0);
    expect(alertLogSamples([send("log-1", 0)], [row("sample-A", ALERT_JOURNAL_WINDOW_MS + 1)]).size).toBe(0);
    expect(alertLogSamples([send("log-1", 0)], [row("sample-A", ALERT_JOURNAL_WINDOW_MS)]).get("log-1")).toBe("sample-A");
  });

  it("ignores a row with no sample or unreadable metadata", () => {
    const unreadable: AlertJournalRow = { entityId: "sample-A", createdAt: at(10), metadata: "{not json" };
    expect(alertLogSamples([send("log-1", 0)], [row(null, 10), unreadable]).size).toBe(0);
  });

  it("leaves a send unpaired when its row is already taken", () => {
    const paired = alertLogSamples([send("log-1", 0), send("log-2", 1)], [row("sample-A", 20)]);
    expect(paired.get("log-1")).toBe("sample-A");
    expect(paired.has("log-2")).toBe(false);
  });

  it("needs the same germ: the send's subject names it", () => {
    // An older E. coli row is not this Listeria alert's, however near.
    const paired = alertLogSamples(
      [send("log-1", 0, { subject: alertSubject("Listeria") })],
      [row("sample-B", 20), row("sample-A", 25, { germe: "Listeria" })]
    );
    expect(paired.get("log-1")).toBe("sample-A");
    // A row that names no germ stands for no send.
    expect(alertLogSamples([send("log-1", 0)], [row("sample-A", 20, { germe: null })]).size).toBe(0);
  });

  it("an older send with a report keeps its own row once it competes", () => {
    // B (the approval's alert, linked) at 0, its row Y at 20; A (the
    // technical validation's) at 5, its row X at 25.
    const rows = [row("sample-Y", 20), row("sample-X", 25)];
    const paired = alertLogSamples([send("log-A", 5), send("log-B", 0)], rows);
    expect(paired.get("log-A")).toBe("sample-X");
    expect(paired.get("log-B")).toBe("sample-Y");
  });

  it("the exact link holds beyond the window of the guess", () => {
    const late = ALERT_JOURNAL_WINDOW_MS + 5_000;
    expect(alertLogSamples([send("log-1", 0)], [row("sample-A", late, { emailLogId: "log-1" })]).get("log-1")).toBe("sample-A");
    // Unnamed, the same row is too far to be guessed.
    expect(alertLogSamples([send("log-1", 0)], [row("sample-A", late)]).size).toBe(0);
  });
});

/** The journal as Prisma reads it: what falls inside the spans asked for. */
function storeOf(sends: AlertSend[], rows: AlertJournalRow[]) {
  const reads = { sends: [] as TimeWindow[][], rows: [] as TimeWindow[][] };
  const inside = (windows: TimeWindow[], date: Date) =>
    windows.some((window) => date.getTime() >= window.from && date.getTime() <= window.to);
  const store: AlertJournalStore = {
    alertSends: async (windows) => {
      reads.sends.push(windows);
      return sends.filter((entry) => inside(windows, entry.createdAt));
    },
    journalRows: async (windows) => {
      reads.rows.push(windows);
      return rows.filter((entry) => inside(windows, entry.createdAt));
    },
  };
  return { store, reads };
}

describe("pairAlertSends — the same sample whatever page the alert is read on", () => {
  it("competes an older alert that carries a report (not on the list asked for)", async () => {
    const linked = send("log-B", 0);
    const early = send("log-A", 5);
    const { store } = storeOf([linked, early], [row("sample-Y", 20), row("sample-X", 25)]);
    const paired = await pairAlertSends([early], store);
    expect(paired.get("log-A")).toBe("sample-X");
    // Only the sends asked for come back.
    expect([...paired.keys()]).toEqual(["log-A"]);
  });

  it("gives an alert the same sample on its own page as on a page with its neighbour", async () => {
    const older = send("log-1", 0);
    const newer = send("log-2", 5);
    const { store } = storeOf([older, newer], [row("sample-1", 20), row("sample-2", 25)]);
    const together = await pairAlertSends([older, newer], store);
    expect(together.get("log-1")).toBe("sample-1");
    expect(together.get("log-2")).toBe("sample-2");
    expect((await pairAlertSends([newer], store)).get("log-2")).toBe("sample-2");
    expect((await pairAlertSends([older], store)).get("log-1")).toBe("sample-1");
  });

  it("reads the competitors just before each send, and the rows up to the exact link's reach", async () => {
    const late = ALERT_JOURNAL_WINDOW_MS + 5_000;
    const { store, reads } = storeOf([send("log-1", 0)], [row("sample-A", late, { emailLogId: "log-1" })]);
    expect((await pairAlertSends([send("log-1", 0)], store)).get("log-1")).toBe("sample-A");
    expect(reads.sends).toEqual([[{ from: t0 - ALERT_JOURNAL_WINDOW_MS, to: t0 }]]);
    expect(reads.rows).toEqual([[{ from: t0, to: t0 + ALERT_JOURNAL_EXACT_MS }]]);
  });

  it("reads nothing for no send", async () => {
    const { store, reads } = storeOf([], []);
    expect((await pairAlertSends([], store)).size).toBe(0);
    expect(reads.sends).toEqual([]);
  });
});

describe("timeWindows — one range to read per burst of alerts", () => {
  it("merges the spans that overlap, in time order", () => {
    expect(timeWindows([12, 0, 100, 30], 10, 5)).toEqual([
      { from: -10, to: 17 },
      { from: 20, to: 35 },
      { from: 90, to: 105 },
    ]);
  });

  it("keeps a touching span in the same range, and reads nothing for no time", () => {
    expect(timeWindows([0, 15], 10, 5)).toEqual([{ from: -10, to: 20 }]);
    expect(timeWindows([], 10, 5)).toEqual([]);
  });
});

describe("the « Envois » card of the validation page — the alerts sent before the report", () => {
  it("reads the sends the sample's rows name, and just before the older rows", () => {
    const rows = [
      row("sample-A", 50, { emailLogId: "log-new" }),
      row("sample-A", 20),
      row("sample-A", 25, { germe: "Salmonella" }),
    ];
    expect(sampleAlertLookup(rows)).toEqual({
      named: ["log-new"],
      windows: [{ from: t0 + 20 - ALERT_JOURNAL_WINDOW_MS, to: t0 + 25 }],
    });
    expect(namedSendId(JSON.stringify({ emailLogId: "log-1" }))).toBe("log-1");
    expect(namedSendId("{not json")).toBeNull();
  });

  it("lists them with the report's sends, newest first, once each", () => {
    const report = [
      { id: "r-2", createdAt: at(3_000) },
      { id: "r-1", createdAt: at(2_000) },
    ];
    const early = [
      { id: "a-1", createdAt: at(1_000) },
      { id: "r-1", createdAt: at(2_000) },
    ];
    expect(withEarlyAlerts(report, early)?.map((entry) => entry.id)).toEqual(["r-2", "r-1", "a-1"]);
  });

  it("shows the card before the report exists only when an alert left", () => {
    expect(withEarlyAlerts(null, [])).toBeNull();
    expect(withEarlyAlerts([], [])).toEqual([]);
    expect(withEarlyAlerts(null, [{ id: "a-1", createdAt: at(0) }])?.map((entry) => entry.id)).toEqual(["a-1"]);
  });
});

describe("the journal row the pairing reads", () => {
  it("is written by sendContaminationAlerts with the send's id and the germ", () => {
    const source = readFileSync(fileURLToPath(new URL("./report-dispatch.ts", import.meta.url)), "utf8");
    expect(source).toContain(`action: "${ALERT_JOURNAL_ACTION}"`);
    expect(source).toContain("emailLogId: result.logId");
    expect(source).toContain("germe: germ,");
  });

  it("names the germ the alert's subject carries", () => {
    expect(alertEmail("Listeria", []).subject).toBe(alertSubject("Listeria"));
  });
});
