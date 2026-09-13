import { describe, expect, it } from "vitest";
import { groupBySerie } from "./serie-groups";

describe("groupBySerie", () => {
  it("keeps the list order and gathers a série's samples under one header", () => {
    const items = [
      { id: "a", serie: { serialNumber: "9/26" }, client: { name: "Palmier" } },
      { id: "b", serie: { serialNumber: "10/26" }, client: { name: "Atlas" } },
      { id: "c", serie: { serialNumber: "9/26" }, client: { name: "Palmier" } },
    ];
    expect(groupBySerie(items)).toEqual([
      { serialNumber: "9/26", clientName: "Palmier", items: [items[0], items[2]] },
      { serialNumber: "10/26", clientName: "Atlas", items: [items[1]] },
    ]);
    expect(groupBySerie([])).toEqual([]);
  });
});
