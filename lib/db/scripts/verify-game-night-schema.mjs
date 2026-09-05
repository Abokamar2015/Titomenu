import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

function resolveDatabaseUrl() {
  const supplied = process.env.SUPABASE_DATABASE_URL?.trim();
  if (!supplied) {
    throw new Error(
      "SUPABASE_DATABASE_URL must be set; Game Night verification never falls back to DATABASE_URL",
    );
  }
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) return supplied;
  const url = new URL(supplied);
  url.password = password;
  return url.toString();
}

const expectedTables = [
  "game_night_events",
  "game_night_rounds",
  "game_night_questions",
  "game_night_event_questions",
  "game_night_teams",
  "game_night_players",
  "game_night_player_sessions",
  "game_night_answers",
  "game_night_score_ledger",
  "game_night_state_snapshots",
  "game_night_audit_logs",
];
const connectionString = resolveDatabaseUrl();
const pool = new pg.Pool({
  connectionString,
  ...(/supabase\.(co|com)/.test(new URL(connectionString).hostname)
    ? { ssl: { rejectUnauthorized: false } }
    : {}),
});

let savepointSequence = 0;
async function assertRejected(client, query, values, label) {
  const savepoint = `verify_rejection_${++savepointSequence}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await client.query(query, values);
  } catch {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    return;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  throw new Error(`Expected constraint rejection did not occur: ${label}`);
}

async function assertRoleDenied(client, roleName) {
  const savepoint = `verify_role_${++savepointSequence}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  await client.query(`SET LOCAL ROLE "${roleName}"`);
  try {
    await client.query("SELECT 1 FROM game_night_events LIMIT 1");
  } catch {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    return;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  throw new Error(`${roleName} unexpectedly has access to game_night_events`);
}

const client = await pool.connect();
try {
  const tableResult = await client.query(
    `SELECT relname, relrowsecurity
       FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1::text[])`,
    [expectedTables],
  );
  const rlsByTable = new Map(
    tableResult.rows.map((row) => [row.relname, row.relrowsecurity]),
  );
  const missingOrUnprotected = expectedTables.filter(
    (table) => rlsByTable.get(table) !== true,
  );
  if (missingOrUnprotected.length) {
    throw new Error(
      `Missing tables or RLS disabled: ${missingOrUnprotected.join(", ")}`,
    );
  }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  for (const migrationFilename of [
    "0001_game_night_foundation.sql",
    "0002_game_night_tenant_fk_hardening.sql",
    "0003_game_night_audit_eventless_session_fk.sql",
  ]) {
    const migrationSql = await readFile(
      path.join(root, "migrations", migrationFilename),
      "utf8",
    );
    const expectedChecksum = createHash("sha256")
      .update(migrationSql)
      .digest("hex");
    const migrationRow = await client.query(
      "SELECT checksum_sha256 FROM game_night_schema_migrations WHERE filename = $1",
      [migrationFilename],
    );
    if (
      migrationRow.rowCount !== 1 ||
      migrationRow.rows[0].checksum_sha256 !== expectedChecksum
    ) {
      throw new Error(
        `Migration ledger checksum is missing or mismatched for ${migrationFilename}`,
      );
    }
  }

  await client.query("BEGIN");
  try {
    const suffix = `schema-verify-${Date.now()}`;
    const restaurantOne = await client.query(
      `INSERT INTO restaurants (slug, name_ar, name_en)
       VALUES ($1, $2, $3) RETURNING id`,
      [suffix, suffix, suffix],
    );
    const restaurantTwo = await client.query(
      `INSERT INTO restaurants (slug, name_ar, name_en)
       VALUES ($1, $2, $3) RETURNING id`,
      [`${suffix}-two`, suffix, suffix],
    );
    const restaurantOneId = restaurantOne.rows[0].id;
    const restaurantTwoId = restaurantTwo.rows[0].id;

    await assertRejected(
      client,
      `INSERT INTO game_night_events (restaurant_id, slug, access_code, title, state)
       VALUES ($1, 'invalid-state', 'VERIFY1', 'Verification', 'draft')`,
      [restaurantOneId],
      "uppercase canonical event state",
    );
    await assertRejected(
      client,
      `INSERT INTO game_night_events (restaurant_id, slug, access_code, title, state, started_at)
       VALUES ($1, 'invalid-order', 'VERIFY2', 'Verification', 'LIVE', now())`,
      [restaurantOneId],
      "started_at requires ready_at",
    );
    const eventOne = await client.query(
      `INSERT INTO game_night_events (restaurant_id, slug, access_code, title, state)
       VALUES ($1, 'valid-event', 'VERIFY3', 'Verification', 'DRAFT') RETURNING id`,
      [restaurantOneId],
    );
    const eventTwo = await client.query(
      `INSERT INTO game_night_events (restaurant_id, slug, access_code, title, state)
       VALUES ($1, 'second-event', 'VERIFY4', 'Verification', 'DRAFT') RETURNING id`,
      [restaurantTwoId],
    );
    const team = await client.query(
      `INSERT INTO game_night_teams (restaurant_id, event_id, name, join_code)
       VALUES ($1, $2, 'Verification team', 'TEAM01') RETURNING id`,
      [restaurantOneId, eventOne.rows[0].id],
    );
    const otherTeam = await client.query(
      `INSERT INTO game_night_teams (restaurant_id, event_id, name, join_code)
       VALUES ($1, $2, 'Other verification team', 'TEAM02') RETURNING id`,
      [restaurantOneId, eventOne.rows[0].id],
    );
    await assertRejected(
      client,
      `INSERT INTO game_night_players (restaurant_id, event_id, team_id, display_name)
       VALUES ($1, $2, $3, 'Cross tenant player')`,
      [restaurantTwoId, eventTwo.rows[0].id, team.rows[0].id],
      "cross-restaurant team composite foreign key",
    );
    const player = await client.query(
      `INSERT INTO game_night_players (restaurant_id, event_id, team_id, display_name)
       VALUES ($1, $2, $3, 'Verification player') RETURNING id`,
      [restaurantOneId, eventOne.rows[0].id, team.rows[0].id],
    );
    const round = await client.query(
      `INSERT INTO game_night_rounds (restaurant_id, event_id, ordinal, title)
       VALUES ($1, $2, 1, 'Verification round') RETURNING id`,
      [restaurantOneId, eventOne.rows[0].id],
    );
    const eventQuestion = await client.query(
      `INSERT INTO game_night_event_questions
        (restaurant_id, event_id, round_id, ordinal, prompt_snapshot, question_type_snapshot, correct_answer_snapshot)
       VALUES ($1, $2, $3, 1, 'Verification question', 'short_text', '"answer"'::jsonb) RETURNING id`,
      [restaurantOneId, eventOne.rows[0].id, round.rows[0].id],
    );
    const answer = await client.query(
      `INSERT INTO game_night_answers
        (restaurant_id, event_id, event_question_id, team_id, submitted_by_player_id, answer)
       VALUES ($1, $2, $3, $4, $5, '"answer"'::jsonb) RETURNING id`,
      [
        restaurantOneId,
        eventOne.rows[0].id,
        eventQuestion.rows[0].id,
        team.rows[0].id,
        player.rows[0].id,
      ],
    );

    const ledger = await client.query(
      `INSERT INTO game_night_score_ledger
        (restaurant_id, event_id, team_id, action, reason, points_delta, idempotency_key)
       VALUES ($1, $2, $3, 'VERIFY', 'verification', 1, 'verify-ledger-key') RETURNING id`,
      [restaurantOneId, eventOne.rows[0].id, team.rows[0].id],
    );
    await assertRejected(
      client,
      `INSERT INTO game_night_score_ledger
        (restaurant_id, event_id, team_id, action, reason, points_delta, idempotency_key)
       VALUES ($1, $2, $3, 'VERIFY', 'verification', 1, 'verify-ledger-key')`,
      [restaurantOneId, eventOne.rows[0].id, team.rows[0].id],
      "duplicate score ledger idempotency key",
    );
    await assertRejected(
      client,
      `INSERT INTO game_night_score_ledger
        (restaurant_id, event_id, team_id, answer_id, action, reason, points_delta, idempotency_key)
       VALUES ($1, $2, $3, $4, 'VERIFY', 'verification', 1, 'cross-team-answer-key')`,
      [
        restaurantOneId,
        eventOne.rows[0].id,
        otherTeam.rows[0].id,
        answer.rows[0].id,
      ],
      "cross-team score ledger answer composite foreign key",
    );
    await assertRejected(
      client,
      "UPDATE game_night_score_ledger SET reason = 'changed' WHERE id = $1",
      [ledger.rows[0].id],
      "score ledger update trigger",
    );
    await assertRejected(
      client,
      "DELETE FROM game_night_score_ledger WHERE id = $1",
      [ledger.rows[0].id],
      "score ledger delete trigger",
    );
    const eventSameRestaurant = await client.query(
      `INSERT INTO game_night_events (restaurant_id, slug, access_code, title, state)
       VALUES ($1, 'same-restaurant-event', 'VERIFY5', 'Verification', 'DRAFT') RETURNING id`,
      [restaurantOneId],
    );
    const session = await client.query(
      `INSERT INTO game_night_player_sessions
        (restaurant_id, event_id, team_id, player_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + interval '1 hour') RETURNING id`,
      [
        restaurantOneId,
        eventOne.rows[0].id,
        team.rows[0].id,
        player.rows[0].id,
        `${suffix}-token-hash`,
      ],
    );
    await assertRejected(
      client,
      `INSERT INTO game_night_audit_logs
        (restaurant_id, event_id, actor_session_id, action, entity_type)
       VALUES ($1, $2, $3, 'VERIFY', 'event')`,
      [restaurantOneId, eventSameRestaurant.rows[0].id, session.rows[0].id],
      "cross-event audit actor session composite foreign key",
    );
    await assertRejected(
      client,
      `INSERT INTO game_night_audit_logs
        (restaurant_id, actor_session_id, action, entity_type)
       VALUES ($1, '00000000-0000-0000-0000-000000000000', 'VERIFY', 'event')`,
      [restaurantOneId],
      "eventless audit nonexistent session foreign key",
    );
    await assertRejected(
      client,
      `INSERT INTO game_night_audit_logs
        (restaurant_id, actor_session_id, action, entity_type)
       VALUES ($1, $2, 'VERIFY', 'event')`,
      [restaurantTwoId, session.rows[0].id],
      "eventless audit cross-restaurant session foreign key",
    );
    await client.query(
      `INSERT INTO game_night_audit_logs
        (restaurant_id, actor_session_id, action, entity_type)
       VALUES ($1, $2, 'VERIFY', 'event')`,
      [restaurantOneId, session.rows[0].id],
    );

    const roles = await client.query(
      "SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])",
      [["anon", "authenticated"]],
    );
    for (const { rolname } of roles.rows) {
      await assertRoleDenied(client, rolname);
    }
  } finally {
    await client.query("ROLLBACK");
  }
  console.log(
    `Verified ${expectedTables.length} Game Night tables, migration checksum, RLS, and transactional constraints.`,
  );
} finally {
  client.release();
  await pool.end();
}
