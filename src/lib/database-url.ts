/** The pool when DB_POOL_SIZE is unset or not a whole number from 1 to 50. */
export const DEFAULT_POOL_SIZE = 5;

/**
 * Connections the application keeps to the database: DB_POOL_SIZE (1–50),
 * else five. Production sets it (docker-compose.yml) so a burst — a series
 * of validations, a bench sheet — no longer makes every other person's page
 * wait for a connection (.ui-tests/perf/plan.md P1-3).
 */
export function poolSize(raw: string | undefined = process.env.DB_POOL_SIZE): number {
  const value = raw?.trim() ?? "";
  if (!/^\d+$/.test(value)) return DEFAULT_POOL_SIZE;
  const size = Number(value);
  return size >= 1 && size <= 50 ? size : DEFAULT_POOL_SIZE;
}

export function parseDatabaseUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    connectionLimit: poolSize(),
  };
}

export function getMariaDbConfig() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }
  return parseDatabaseUrl(databaseUrl);
}
