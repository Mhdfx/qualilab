import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_POOL_SIZE, parseDatabaseUrl, poolSize } from "./database-url";

const URL_ = "mysql://qualilab:p%40ss@db:3306/qualilab";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseDatabaseUrl", () => {
  it("reads the connection from the URL", () => {
    const config = parseDatabaseUrl(URL_);
    expect(config).toMatchObject({ host: "db", port: 3306, user: "qualilab", password: "p@ss", database: "qualilab" });
  });

  it("keeps a pool of five when DB_POOL_SIZE is unset", () => {
    vi.stubEnv("DB_POOL_SIZE", undefined);
    expect(DEFAULT_POOL_SIZE).toBe(5);
    expect(parseDatabaseUrl(URL_).connectionLimit).toBe(5);
  });

  it("takes DB_POOL_SIZE when it is set (production: 15)", () => {
    vi.stubEnv("DB_POOL_SIZE", "15");
    expect(parseDatabaseUrl(URL_).connectionLimit).toBe(15);
  });

  it("falls back to five on anything but a whole number from 1 to 50", () => {
    for (const raw of ["", " ", "0", "51", "-3", "2.5", "abc", "15abc", "1e2"]) {
      expect(poolSize(raw)).toBe(5);
    }
    expect(poolSize("1")).toBe(1);
    expect(poolSize(" 50 ")).toBe(50);
  });
});
