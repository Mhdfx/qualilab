import "dotenv/config";
import { getMariaDbConfig } from "../src/lib/database-url";
import mariadb from "mariadb";

const config = getMariaDbConfig();
console.log("DATABASE_URL user:", config.user);
console.log("DATABASE_URL host:", config.host);
console.log("DATABASE_URL database:", config.database);
console.log("Password length:", config.password?.length ?? 0);

try {
  const conn = await mariadb.createConnection(config);
  const rows = await conn.query("SELECT 1 AS ok");
  console.log("MySQL connection: OK", rows);
  await conn.end();
} catch (err) {
  console.error("MySQL connection: FAILED");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
