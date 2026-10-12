import { describe, expect, it } from "vitest";
import { SingleFlight } from "./single-flight";

describe("SingleFlight", () => {
  it("runs a task and hands its value back", async () => {
    const flight = new SingleFlight();
    expect(await flight.run("a", async () => 42)).toEqual({ ran: true, value: 42 });
  });

  it("refuses a second run of the same key while the first is under way", async () => {
    const flight = new SingleFlight();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let runs = 0;
    const task = async () => {
      runs += 1;
      await gate;
      return runs;
    };
    const first = flight.run("rapport", task);
    expect(flight.isRunning("rapport")).toBe(true);
    expect(await flight.run("rapport", task)).toEqual({ ran: false });
    // another key is independent
    expect(await flight.run("autre", async () => "ok")).toEqual({ ran: true, value: "ok" });
    release();
    expect(await first).toEqual({ ran: true, value: 1 });
    expect(runs).toBe(1);
  });

  it("frees the key once the run is over, even when it failed", async () => {
    const flight = new SingleFlight();
    await expect(flight.run("k", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(flight.isRunning("k")).toBe(false);
    expect(await flight.run("k", async () => "again")).toEqual({ ran: true, value: "again" });
  });
});
