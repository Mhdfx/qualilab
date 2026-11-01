import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { alertCopyRecipients, type AlertCopy } from "./alert-copies";

vi.mock("server-only", () => ({}));

import { moveAlertCopies } from "./client-transfer";

/**
 * Lot 3C, L5 × « Fusionner avec… » / « Rattacher comme site de… »: an
 * internal copy address set to « clients choisis » for the client that
 * disappears is chosen for the client kept — the alerts of the moved
 * samples (now carrying the kept client's id) still reach it.
 */

type Link = { addressId: string; clientId: string };

function stubTx(links: Link[]) {
  const rows = [...links];
  const tx = {
    alertCopyClient: {
      findMany: vi.fn(async ({ where }: { where: { clientId: { in: string[] } } }) =>
        rows.filter((row) => where.clientId.in.includes(row.clientId)).map(({ addressId }) => ({ addressId }))
      ),
      createMany: vi.fn(async ({ data }: { data: Link[]; skipDuplicates: boolean }) => {
        let count = 0;
        for (const link of data) {
          if (rows.some((row) => row.addressId === link.addressId && row.clientId === link.clientId)) continue;
          rows.push(link);
          count += 1;
        }
        return { count };
      }),
      deleteMany: vi.fn(async ({ where }: { where: { clientId: { in: string[] } } }) => {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i -= 1) if (where.clientId.in.includes(rows[i].clientId)) rows.splice(i, 1);
        return { count: before - rows.length };
      }),
    },
  };
  return { tx, rows };
}

const copies = (rows: Link[]): AlertCopy[] =>
  ["a-qualite", "a-direction"].map((id) => ({
    email: `${id}@labo.test`,
    allClients: false,
    active: true,
    clientIds: rows.filter((row) => row.addressId === id).map((row) => row.clientId),
  }));

describe("moveAlertCopies (L5 at a merge or an attachment)", () => {
  it("an address chosen for the source reaches the target's alerts after the merge", async () => {
    const { tx, rows } = stubTx([
      { addressId: "a-qualite", clientId: "b-source" },
      { addressId: "a-direction", clientId: "b-source" },
      { addressId: "a-direction", clientId: "a-target" },
    ]);
    // Before: a sample of B (now carrying A's id once moved) would miss « qualité ».
    expect(alertCopyRecipients({ copies: copies(rows), clientId: "a-target", base: [], to: [] })).toEqual(["a-direction@labo.test"]);

    const moved = await moveAlertCopies(tx as never, ["b-source"], "a-target");
    expect(moved).toBe(1); // « direction » was already chosen for A: not written twice
    expect(rows).toEqual(
      expect.arrayContaining([
        { addressId: "a-direction", clientId: "a-target" },
        { addressId: "a-qualite", clientId: "a-target" },
      ])
    );
    expect(rows.some((row) => row.clientId === "b-source")).toBe(false);
    expect(alertCopyRecipients({ copies: copies(rows), clientId: "a-target", base: [], to: [] })).toEqual([
      "a-qualite@labo.test",
      "a-direction@labo.test",
    ]);
  });

  it("writes nothing when the source has no chosen address, or is the target", async () => {
    const { tx } = stubTx([{ addressId: "a-qualite", clientId: "a-target" }]);
    expect(await moveAlertCopies(tx as never, ["b-source"], "a-target")).toBe(0);
    expect(await moveAlertCopies(tx as never, ["a-target"], "a-target")).toBe(0);
    expect(tx.alertCopyClient.createMany).not.toHaveBeenCalled();
    expect(tx.alertCopyClient.deleteMany).not.toHaveBeenCalled();
  });
});

describe("both transactions move the alert copies and report the count", () => {
  const APP = fileURLToPath(new URL("../app", import.meta.url));
  const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

  it("« Fusionner avec… »", () => {
    const route = read("api/clients/[id]/merge/route.ts");
    expect(route).toMatch(/counts\.alertCopies = await moveAlertCopies\(tx, \[sourceId\], targetId\)/);
    // The journal carries the counts (CLIENT_MERGED, `shared.counts`).
    expect(route).toMatch(/counts: outcome\.counts/);
  });

  it("« Rattacher comme site de… »", () => {
    const route = read("api/clients/[id]/attach-as-site/route.ts");
    expect(route).toMatch(/const alertCopies = await moveAlertCopies\(tx, \[sourceId\], parentId\)/);
    expect(route).toMatch(/counts: \{[\s\S]*alertCopies,[\s\S]*\}/);
  });
});
