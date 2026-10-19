import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CancelReason } from "@/generated/prisma/enums";
import { CANCEL_REASON_LABELS } from "./labels";
import { otherSitesMessage } from "./email-recipients";
import { NO_ADDRESS_MESSAGE, cancelNotifiesClient, deliverNotice, notReceivedNoticeText, type NoticeSend } from "./not-received";

/**
 * « Non reçu au laboratoire » told to the client — the laboratory's answer
 * of 16/10 to Q74: « un mail par un échantillon pas reçu ». Invented
 * addresses only.
 */

/** A send that records each call and answers `status`, or throws. */
function recorder(status: "ENVOYE" | "SIMULE" | "ECHEC" | Error, error: string | null = null) {
  const calls: string[][] = [];
  const send: NoticeSend = async (to) => {
    calls.push(to);
    if (status instanceof Error) throw status;
    return { status, error };
  };
  return { calls, send };
}

describe("cancelNotifiesClient — which cancellation tells the client", () => {
  it("is « Non reçu au laboratoire », and no other motif", () => {
    const reasons = Object.keys(CANCEL_REASON_LABELS) as CancelReason[];
    expect(reasons.filter(cancelNotifiesClient)).toEqual(["NON_RECU"]);
  });
});

describe("deliverNotice — one notice, one e-mail", () => {
  const recipients = { to: ["contact@client.test", "qualite@client.test"], otherSitesOnly: false };

  it("sends exactly one e-mail to the report recipients and keeps its status", async () => {
    const { calls, send } = recorder("SIMULE");
    expect(await deliverNotice(recipients, "site-1", send)).toEqual({ to: recipients.to, status: "SIMULE", error: null });
    expect(calls).toEqual([recipients.to]);
  });

  it("sends nothing when nobody applies, and says why — no address, or only other sites'", async () => {
    const none = recorder("ENVOYE");
    expect(await deliverNotice({ to: [], otherSitesOnly: false }, null, none.send)).toEqual({
      to: [],
      status: "NON_ENVOYE",
      error: NO_ADDRESS_MESSAGE,
    });
    const elsewhere = recorder("ENVOYE");
    expect(await deliverNotice({ to: [], otherSitesOnly: true }, "site-1", elsewhere.send)).toEqual({
      to: [],
      status: "NON_ENVOYE",
      error: otherSitesMessage("reports", "site-1"),
    });
    expect([...none.calls, ...elsewhere.calls]).toEqual([]);
  });

  it("turns a send that throws into a failure — never an exception that would undo the cancellation", async () => {
    const { calls, send } = recorder(new Error("Fournisseur injoignable"));
    await expect(deliverNotice(recipients, null, send)).resolves.toEqual({
      to: recipients.to,
      status: "ECHEC",
      error: "Fournisseur injoignable",
    });
    expect(calls).toHaveLength(1);
    const refused = recorder("ECHEC", "HTTP 422");
    expect(await deliverNotice(recipients, null, refused.send)).toMatchObject({ status: "ECHEC", error: "HTTP 422" });
  });
});

describe("notReceivedNoticeText — what the « Annuler » dialog says", () => {
  it("« Client prévenu » only when the e-mail left — a simulated send never leaves: call the client", () => {
    expect(notReceivedNoticeText({ status: "ENVOYE" })).toEqual({ ok: true, text: "Client prévenu par e-mail." });
    expect(notReceivedNoticeText({ status: "SIMULE" })).toEqual({
      ok: false,
      text: "Envoi simulé : aucun service d'envoi n'est configuré, l'e-mail est inscrit au journal des envois mais n'a pas quitté le laboratoire. Prévenez le client par téléphone.",
    });
    expect(notReceivedNoticeText({ status: "SIMULE" }).text).not.toMatch(/Client prévenu|partira/);
  });

  it("says why the client was not told, and to call", () => {
    expect(notReceivedNoticeText({ status: "NON_ENVOYE", error: NO_ADDRESS_MESSAGE })).toEqual({
      ok: false,
      text: "Client non prévenu : aucune adresse e-mail enregistrée pour ce client. Prévenez-le par téléphone.",
    });
    expect(notReceivedNoticeText({ status: "NON_ENVOYE", error: null }).text).toContain("aucune adresse e-mail enregistrée");
    expect(notReceivedNoticeText({ status: "ECHEC", error: "HTTP 500" })).toEqual({
      ok: false,
      text: "Client non prévenu : l'envoi de l'e-mail a échoué. Prévenez-le par téléphone.",
    });
  });
});

describe("POST /api/samples/[id]/cancel — the notice of a « Non reçu »", () => {
  // Read from the source: the route imports the database client.
  const source = readFileSync(fileURLToPath(new URL("../app/api/samples/[id]/cancel/route.ts", import.meta.url)), "utf8");

  it("sends exactly one notice, for « Non reçu » only, after the guarded write", () => {
    const calls = source.match(/notifyNotReceived\(/g) ?? [];
    expect(calls).toHaveLength(1);
    const call = source.indexOf("notifyNotReceived(id, session.id)");
    expect(call).toBeGreaterThan(0);
    // Decided by the one rule, never by a motif written again here.
    expect(source.slice(call - 120, call)).toMatch(/cancelNotifiesClient\(reason\)\s*\?\s*await\s*$/);
    // After the cancellation is written and counted.
    expect(source.indexOf("moved.count === 0")).toBeGreaterThan(0);
    expect(source.indexOf("moved.count === 0")).toBeLessThan(call);
  });

  it("never lets a failed notice undo the cancellation, and answers its status", () => {
    const call = source.indexOf("notifyNotReceived(id, session.id)");
    expect(source.slice(call, call + 300)).toMatch(/\.catch\(/);
    expect(source).toMatch(/notice:\s*\{\s*status:\s*notice\.status/);
  });
});
