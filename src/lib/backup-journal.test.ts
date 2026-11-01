import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BACKUP_JOURNAL_HEADER, backupHealth, parseBackupJournal } from "./backup-journal";

// Lines exactly as scripts/backup-db.sh wrote them on a test run (01/11).
const JOURNAL = `${BACKUP_JOURNAL_HEADER}
2026-11-01T02:26:38Z;ok;qualilab_2026-11-01_0226.sql.gz;6222;5330abc1a5e0ae0e4cdc9ed7c6bc5d42c92e444a1c0ef5727a5719a4baa4754a;ignoree;
2026-11-01T02:26:44Z;echec;qualilab_2026-11-01_0226.sql.gz;6221;97568daf8fd7f4810fa53827ed79f449cf57c123317d610ae4800e432aa530c2;echec;offsite FAILED: rclone copy to x:y
2026-11-01T02:26:49Z;echec;;;;non-tentee;mysqldump a échoué (base injoignable ?)
pas une ligne
`;

describe("parseBackupJournal (L2, Q97)", () => {
  it("reads every run, newest first, and skips a malformed line", () => {
    const { runs, skipped } = parseBackupJournal(JOURNAL);
    expect(skipped).toBe(1);
    expect(runs.map((r) => [r.status, r.offsite])).toEqual([
      ["echec", "non-tentee"],
      ["echec", "echec"],
      ["ok", "ignoree"],
    ]);
    expect(runs[2]).toEqual({
      at: new Date("2026-11-01T02:26:38Z"),
      status: "ok",
      file: "qualilab_2026-11-01_0226.sql.gz",
      bytes: 6222,
      sha256: "5330abc1a5e0ae0e4cdc9ed7c6bc5d42c92e444a1c0ef5727a5719a4baa4754a",
      offsite: "ignoree",
      message: null,
    });
    expect(runs[0]).toMatchObject({ file: null, bytes: null, sha256: null, message: "mysqldump a échoué (base injoignable ?)" });
  });

  it("reads Windows line ends and an empty file", () => {
    expect(parseBackupJournal(JOURNAL.replace(/\n/g, "\r\n")).runs).toHaveLength(3);
    expect(parseBackupJournal("")).toEqual({ runs: [], skipped: 0 });
  });
});

describe("backupHealth", () => {
  const now = new Date("2026-11-01T08:00:00Z");
  const { runs } = parseBackupJournal(JOURNAL);

  it("warns when the last run failed — and says when only the off-site copy did", () => {
    expect(backupHealth(runs, now)).toMatchObject({ state: "failed", message: "La dernière sauvegarde a échoué : mysqldump a échoué (base injoignable ?)." });
    expect(backupHealth(runs.slice(1), now)).toMatchObject({
      state: "failed",
      message: "La dernière sauvegarde a échoué : la sauvegarde locale est faite, mais la copie hors site a échoué.",
    });
  });

  it("warns when the last run is older than 26 h, all is well before", () => {
    const ok = runs.slice(2);
    expect(backupHealth(ok, now).state).toBe("ok");
    expect(backupHealth(ok, new Date("2026-11-02T04:26:00Z")).state).toBe("ok");
    expect(backupHealth(ok, new Date("2026-11-02T04:27:00Z")).state).toBe("stale");
  });

  it("says when the journal is not reachable or still empty", () => {
    expect(backupHealth(null, now).state).toBe("absent");
    expect(backupHealth([], now).state).toBe("empty");
  });
});

describe("the script writes it", () => {
  it("appends one line per run from its EXIT trap, in the header's order", () => {
    const script = readFileSync(join(process.cwd(), "scripts/backup-db.sh"), "utf8");
    expect(script).toContain(`JOURNAL_HEADER="${BACKUP_JOURNAL_HEADER}"`);
    expect(script).toMatch(/trap finish EXIT/);
    expect(script).toMatch(/RESULT_SHA="\$\(sha256sum "\$FINAL" \| cut -d' ' -f1\)"/);
  });

  it("never lets a journal it cannot write change the run's exit code (read-only directory, checked under WSL on 01/11)", () => {
    const script = readFileSync(join(process.cwd(), "scripts/backup-db.sh"), "utf8");
    const finish = script.slice(script.indexOf("finish() {"), script.indexOf("trap finish EXIT"));
    // errexit off inside the trap, before any write; the code kept for the end.
    expect(finish).toMatch(/local code=\$\?\s[\s\S]*?set \+e/);
    expect(finish.indexOf("set +e")).toBeLessThan(finish.indexOf("JOURNAL_HEADER"));
    // The header write is guarded like the line, one warning when either fails.
    expect(finish).toMatch(/if ! \{ \{ \[ -s "\$JOURNAL" \] \|\| echo "\$JOURNAL_HEADER" > "\$JOURNAL"; \} 2>\/dev\/null/);
    expect(finish).toMatch(/echo "backup journal not written: \$JOURNAL" >&2/);
    expect(finish.trimEnd()).toMatch(/exit "\$code"\s*\}$/);
  });

  it("is mounted read-only in the app", () => {
    const compose = readFileSync(join(process.cwd(), "docker-compose.yml"), "utf8");
    expect(compose).toMatch(/\/app\/backup-journal:ro/);
    expect(compose).toMatch(/BACKUP_JOURNAL_PATH: \/app\/backup-journal\/backup-journal\.csv/);
  });
});
