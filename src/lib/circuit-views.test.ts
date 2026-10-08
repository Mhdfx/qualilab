import { describe, expect, it } from "vitest";
import {
  BENCH_VIEWS,
  LATE_STATUSES,
  PRELEVEUR_VIEWS,
  PROGRAMMATION_QUEUE_STATUSES,
  PROGRAMMATION_VIEWS,
  VALIDATION_VIEWS,
  benchViewWhere,
  inValidationView,
  isLate,
  programmationWhere,
  visitViewStart,
  visitsInView,
  type BenchView,
  type ProgrammationView,
} from "./circuit-views";
import { benchQueueWhereFor, benchWhereFor } from "./bench-access";
import { parseView, serverIsoDay, viewHref } from "./dashboard-view";
import { parseSampleSearch, rechercheHref } from "./sample-search";

/**
 * « Rendre tous les blocs cliquables comme un tri »: a tile and the list it
 * opens read one definition. These tests pin each view to the filter its
 * tile counts with.
 */

const clock = {
  now: new Date(2026, 9, 8, 14, 30),
  startOfDay: new Date(2026, 9, 8, 0, 0, 0, 0),
};

describe("the views round-trip through the address", () => {
  const pages = [
    ["/programmation", PROGRAMMATION_VIEWS, "file"],
    ["/technicien", BENCH_VIEWS, "analyses"],
    ["/validation", VALIDATION_VIEWS, "file"],
    ["/preleveur", PRELEVEUR_VIEWS, "visites"],
  ] as const;

  it.each(pages)("%s reads back every view its tiles write", (path, views, anchor) => {
    const labels: Readonly<Record<string, string>> = views;
    for (const key of Object.keys(labels)) {
      const url = new URL(viewHref(path, key, anchor), "http://localhost");
      expect(url.pathname).toBe(path);
      expect(url.hash).toBe(`#${anchor}`);
      expect(parseView(url.searchParams.get("vue"), labels)).toBe(key);
    }
  });

  it("gives every view a label to name the list with", () => {
    for (const views of [PROGRAMMATION_VIEWS, BENCH_VIEWS, VALIDATION_VIEWS, PRELEVEUR_VIEWS]) {
      for (const label of Object.values(views)) expect(label.trim()).not.toBe("");
    }
  });
});

describe("serverIsoDay", () => {
  it("writes the server's calendar day", () => {
    expect(serverIsoDay(new Date(2026, 9, 8, 0, 0, 0, 0))).toBe("2026-10-08");
    expect(serverIsoDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("opens on /recherche exactly the day « Reçus aujourd'hui » counts", () => {
    const startOfDay = new Date(2026, 9, 8, 0, 0, 0, 0);
    const endOfDay = new Date(2026, 9, 8, 23, 59, 59, 999);
    const href = rechercheHref({ from: serverIsoDay(startOfDay), to: serverIsoDay(startOfDay) });
    const search = parseSampleSearch(new URL(href, "http://localhost").searchParams);
    expect(search.dateField).toBe("reception");
    expect(search.from?.getTime()).toBe(startOfDay.getTime());
    expect(search.to?.getTime()).toBe(endOfDay.getTime());
  });
});

describe("programmationWhere", () => {
  it("without a view is the queue: received and programmed samples", () => {
    expect(programmationWhere(null, clock)).toEqual({ status: { in: ["RECU", "PROGRAMME"] } });
  });

  it("splits the queue between « À programmer » and « En attente de paillasse »", () => {
    expect(programmationWhere("a_programmer", clock)).toEqual({ status: "RECU" });
    expect(programmationWhere("programmes", clock)).toEqual({ status: "PROGRAMME" });
    expect(["RECU", "PROGRAMME"]).toEqual([...PROGRAMMATION_QUEUE_STATUSES]);
  });

  it("« Programmés aujourd'hui » reaches every step: programmed since the day began", () => {
    // No status: a sample programmed at 8 h may already be at the bench.
    expect(programmationWhere("aujourdhui", clock)).toEqual({ programmedAt: { gte: clock.startOfDay } });
  });

  it("« En retard » is a passed promise on a sample not yet validated", () => {
    expect(programmationWhere("retard", clock)).toEqual({
      dueAt: { lt: clock.now },
      status: { in: ["RECU", "PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"] },
    });
    expect(LATE_STATUSES).not.toContain("VALIDE");
    expect(LATE_STATUSES).not.toContain("ANNULE");
  });

  it("flags a line late by the same rule as the « En retard » view", () => {
    const past = new Date(2026, 9, 8, 14, 29);
    const future = new Date(2026, 9, 8, 14, 31);
    expect(isLate({ dueAt: past, status: "PROGRAMME" }, clock.now)).toBe(true);
    expect(isLate({ dueAt: past, status: "RESULTATS_SAISIS" }, clock.now)).toBe(true);
    // Validated, sent or cancelled: the promise is no longer owed.
    expect(isLate({ dueAt: past, status: "VALIDE" }, clock.now)).toBe(false);
    expect(isLate({ dueAt: past, status: "ANNULE" }, clock.now)).toBe(false);
    expect(isLate({ dueAt: future, status: "RECU" }, clock.now)).toBe(false);
    expect(isLate({ dueAt: clock.now, status: "RECU" }, clock.now)).toBe(false);
    expect(isLate({ dueAt: null, status: "RECU" }, clock.now)).toBe(false);
  });

  it("has a filter for every view", () => {
    for (const view of Object.keys(PROGRAMMATION_VIEWS) as ProgrammationView[]) {
      expect(programmationWhere(view, clock)).toBeTypeOf("object");
    }
  });
});

describe("benchViewWhere", () => {
  const technician = { id: "tech1", role: "TECHNICIEN" as const };
  const admin = { id: "adm", role: "ADMIN" as const };

  it("without a view is the bench itself", () => {
    expect(benchViewWhere(null, technician)).toEqual(benchQueueWhereFor(technician));
    expect(benchViewWhere(null, admin)).toEqual(benchQueueWhereFor(admin));
  });

  it("keeps every view inside the technician's own bench", () => {
    for (const view of Object.keys(BENCH_VIEWS) as BenchView[]) {
      const where = benchViewWhere(view, technician);
      expect(where.AND).toEqual([benchWhereFor(technician), expect.any(Object)]);
    }
  });

  it("filters the two bench steps", () => {
    expect(benchViewWhere("a_commencer", technician)).toEqual({ AND: [benchWhereFor(technician), { status: "PROGRAMME" }] });
    expect(benchViewWhere("en_analyse", technician)).toEqual({ AND: [benchWhereFor(technician), { status: "EN_ANALYSE" }] });
  });

  it("counts « Anomalies » in samples, whatever their step", () => {
    expect(benchViewWhere("anomalies", technician)).toEqual({
      AND: [benchWhereFor(technician), { results: { some: { workStatus: "ANOMALIE" } } }],
    });
  });

  it("« Résultats soumis » are the samples handed to validation", () => {
    expect(benchViewWhere("soumis", technician)).toEqual({
      AND: [benchWhereFor(technician), { status: "RESULTATS_SAISIS" }],
    });
  });

  it("lets the admin oversee every bench", () => {
    expect(benchViewWhere("soumis", admin)).toEqual({ AND: [{}, { status: "RESULTATS_SAISIS" }] });
  });
});

describe("inValidationView", () => {
  const toValidate = { validatedById: null };
  const signed = { validatedById: "valid1" };

  it("splits the submitted samples on the technical signature", () => {
    expect(inValidationView("a_valider", toValidate)).toBe(true);
    expect(inValidationView("a_valider", signed)).toBe(false);
    expect(inValidationView("attente_admin", signed)).toBe(true);
    expect(inValidationView("attente_admin", toValidate)).toBe(false);
  });

  it("keeps everything without a view, and the two views cover the queue exactly once", () => {
    for (const item of [toValidate, signed]) {
      expect(inValidationView(null, item)).toBe(true);
      const hits = (["a_valider", "attente_admin"] as const).filter((view) => inValidationView(view, item));
      expect(hits).toHaveLength(1);
    }
  });
});

describe("préleveur views", () => {
  const now = new Date(2026, 9, 8, 9, 15);

  it("starts today at the device's midnight, the week seven days before", () => {
    expect(visitViewStart("aujourdhui", now)).toEqual(new Date(2026, 9, 8, 0, 0, 0, 0));
    expect(visitViewStart("semaine", now)).toEqual(new Date(2026, 9, 1, 0, 0, 0, 0));
  });

  it("crosses a month boundary", () => {
    expect(visitViewStart("semaine", new Date(2026, 9, 3, 7, 0))).toEqual(new Date(2026, 8, 26, 0, 0, 0, 0));
  });

  const visits = [
    { id: "a", startedAt: new Date(2026, 9, 8, 8, 0).toISOString() },
    { id: "b", startedAt: new Date(2026, 9, 8, 0, 0).toISOString() },
    { id: "c", startedAt: new Date(2026, 9, 7, 23, 59).toISOString() },
    { id: "d", startedAt: new Date(2026, 9, 1, 0, 0) },
    { id: "e", startedAt: new Date(2026, 8, 30, 23, 59) },
  ];

  it("filters the loaded visits in their order, bounds included", () => {
    expect(visitsInView(visits, "aujourdhui", now).map((v) => v.id)).toEqual(["a", "b"]);
    expect(visitsInView(visits, "semaine", now).map((v) => v.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps the whole list without a view, as a copy", () => {
    const all = visitsInView(visits, null, now);
    expect(all.map((v) => v.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(all).not.toBe(visits);
  });
});
