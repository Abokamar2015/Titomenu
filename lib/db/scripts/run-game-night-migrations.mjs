import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

function resolveDatabaseUrl() {
  const supplied = process.env.SUPABASE_DATABASE_URL?.trim();
  if (!supplied)
    throw new Error(
      "SUPABASE_DATABASE_URL must be set; Game Night migrations never fall back to DATABASE_URL",
    );
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) return supplied;
  const url = new URL(supplied);
  url.password = password;
  return url.toString();
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(root, "migrations");
const connectionString = resolveDatabaseUrl();
const pool = new pg.Pool({
  connectionString,
  ...(/supabase\.(co|com)/.test(new URL(connectionString).hostname)
    ? { ssl: { rejectUnauthorized: false } }
    : {}),
});
const client = await pool.connect();

try {
  const files = (await readdir(migrationsDirectory))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();
  await client.query("BEGIN");
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('game_night_schema_migrations'))",
  );
  await client.query(`
    CREATE TABLE IF NOT EXISTS game_night_schema_migrations (
      filename text PRIMARY KEY,
      checksum_sha256 text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  for (const filename of files) {
    const sql = await readFile(
      path.join(migrationsDirectory, filename),
      "utf8",
    );
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await client.query(
      "SELECT checksum_sha256 FROM game_night_schema_migrations WHERE filename = $1",
      [filename],
    );
    if (existing.rowCount) {
      if (existing.rows[0].checksum_sha256 !== checksum) {
        throw new Error(
          `Checksum drift detected for applied migration: ${filename}`,
        );
      }
      continue;
    }
    await client.query(sql);
    await client.query(
      "INSERT INTO game_night_schema_migrations (filename, checksum_sha256) VALUES ($1, $2)",
      [filename, checksum],
    );
    console.log(`Applied ${filename}`);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
