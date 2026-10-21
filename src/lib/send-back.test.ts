import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SEND_BACK_ANSWERED_BY, isCurrentSendBack, maySendBack, type SendBackState } from "./send-back";

const at = (time: string) => new Date(`2026-10-21T${time}:00Z`);

/** Sent back by the validator at 10:00, back on the bench. */
const sentBack: SendBackState = { status: "EN_ANALYSE", rejectedAt: at("10:00") };

describe("maySendBack — the samples worth reading the journal for", () => {
  it("keeps a sample under analysis that a validator sent back", () => {
    expect(maySendBack(sentBack)).toBe(true);
  });

  it("leaves out a sample never sent back, and any other step", () => {
    expect(maySendBack({ status: "EN_ANALYSE", rejectedAt: null })).toBe(false);
    for (const status of ["PROGRAMME", "RESULTATS_SAISIS", "VALIDE", "RAPPORT_ENVOYE", "ANNULE"] as const) {
      expect(maySendBack({ status, rejectedAt: at("10:00") })).toBe(false);
    }
  });
});

describe("isCurrentSendBack — « Renvoyé par … » only while the send-back is unanswered (B2)", () => {
  it("shows the send-back while nothing was submitted after it", () => {
    // The first submission, the one the validator sent back.
    expect(isCurrentSendBack(sentBack, at("09:00"))).toBe(true);
  });

  it("shows it when the journal holds no submission at all (a sample older than the journal)", () => {
    expect(isCurrentSendBack(sentBack, null)).toBe(true);
  });

  it("hides it once the results were submitted again — « Corriger la fiche » or a reactivation brought the sample back since", () => {
    // Sent back 10:00, resubmitted 11:00, then back on the bench for another reason.
    expect(isCurrentSendBack(sentBack, at("11:00"))).toBe(false);
  });

  it("keeps it across a cancellation and « Réactiver » with no submission in between: the request still stands", () => {
    // Sent back 10:00 (last submission 09:00), cancelled, reactivated: the
    // sample is back at its programme, off the bench — no banner…
    expect(isCurrentSendBack({ status: "PROGRAMME", rejectedAt: at("10:00") }, at("09:00"))).toBe(false);
    // …then under analysis again: the request still stands, since neither
    // step touches the send-back nor counts as a submission (pinned below).
    expect(isCurrentSendBack({ status: "EN_ANALYSE", rejectedAt: at("10:00") }, at("09:00"))).toBe(true);
  });

  it("never shows it off the bench, whatever the journal says", () => {
    expect(isCurrentSendBack({ status: "RESULTATS_SAISIS", rejectedAt: at("10:00") }, null)).toBe(false);
    expect(isCurrentSendBack({ status: "PROGRAMME", rejectedAt: at("10:00") }, null)).toBe(false);
    expect(isCurrentSendBack({ status: "EN_ANALYSE", rejectedAt: null }, null)).toBe(false);
  });

  it("reads a submission at the very instant of the send-back as the one sent back", () => {
    expect(isCurrentSendBack(sentBack, at("10:00"))).toBe(true);
  });
});

const source = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

describe("the journal action that answers a send-back", () => {
  it("is the one the submission route writes", () => {
    expect(source("../app/api/samples/[id]/results/submit/route.ts")).toContain(`action: "${SEND_BACK_ANSWERED_BY}"`);
  });

  it("is never written by a cancellation or « Réactiver », which leave the send-back as it was", () => {
    for (const route of ["../app/api/samples/[id]/cancel/route.ts", "../app/api/samples/[id]/reactivate/route.ts"]) {
      const code = source(route);
      expect(code).not.toContain(SEND_BACK_ANSWERED_BY);
      expect(code).not.toContain("rejectedAt");
    }
  });
});

describe("the bench pages read the rule, not the status alone", () => {
  // The old test — « EN_ANALYSE and rejectedAt set » — showed a send-back
  // already answered (B2).
  const statusOnly = /status === "EN_ANALYSE" && \w+\.rejectedAt/;

  it("the analysis sheet's banner and the bench lists' chip go through isCurrentSendBack", () => {
    for (const page of ["../app/technicien/[id]/page.tsx", "../app/technicien/page.tsx"]) {
      const code = source(page);
      expect(code).toContain("isCurrentSendBack(");
      expect(code).not.toContain("rejectedAt !== null;");
      expect(code).not.toMatch(statusOnly);
    }
  });

  it("the « Renvoyé » chip shows the flag the list computed", () => {
    const queue = source("../components/technicien/WorkQueue.tsx");
    expect(queue).toContain("item.sentBack &&");
    expect(queue).not.toMatch(statusOnly);
  });
});
