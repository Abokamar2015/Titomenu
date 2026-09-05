import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { restaurantsTable } from "./restaurants";
import { usersTable } from "./users";

export const GAME_NIGHT_EVENT_STATES = [
  "DRAFT",
  "READY",
  "LIVE",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
] as const;
export const GAME_NIGHT_QUESTION_TYPES = [
  "multiple_choice",
  "true_false",
  "short_text",
  "number",
] as const;

export const gameNightEventsTable = pgTable(
  "game_night_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurantsTable.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    accessCode: text("access_code").notNull(),
    title: text("title").notNull(),
    state: text("state", { enum: GAME_NIGHT_EVENT_STATES })
      .notNull()
      .default("DRAFT"),
    version: integer("version").notNull().default(1),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("game_night_events_restaurant_id_id_key").on(t.restaurantId, t.id),
    unique("game_night_events_restaurant_id_slug_key").on(
      t.restaurantId,
      t.slug,
    ),
    unique("game_night_events_restaurant_id_access_code_key").on(
      t.restaurantId,
      t.accessCode,
    ),
    check(
      "game_night_events_state_check",
      sql`${t.state} in ('DRAFT', 'READY', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')`,
    ),
    check("game_night_events_version_check", sql`${t.version} > 0`),
    check(
      "game_night_events_slug_check",
      sql`${t.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
    check(
      "game_night_events_access_code_check",
      sql`${t.accessCode} ~ '^[A-Z0-9]{4,12}$'`,
    ),
    check(
      "game_night_events_started_requires_ready_check",
      sql`${t.startedAt} is null or ${t.readyAt} is not null`,
    ),
    check(
      "game_night_events_started_after_ready_check",
      sql`${t.startedAt} is null or ${t.startedAt} >= ${t.readyAt}`,
    ),
    check(
      "game_night_events_completed_check",
      sql`${t.completedAt} is null or (${t.startedAt} is not null and ${t.completedAt} >= ${t.startedAt})`,
    ),
    check(
      "game_night_events_cancelled_check",
      sql`${t.cancelledAt} is null or ${t.cancelledAt} >= ${t.createdAt}`,
    ),
    check(
      "game_night_events_terminal_timestamp_check",
      sql`not (${t.completedAt} is not null and ${t.cancelledAt} is not null)`,
    ),
    index("game_night_events_state_idx").on(t.restaurantId, t.state, t.readyAt),
  ],
);

export const gameNightRoundsTable = pgTable(
  "game_night_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurantsTable.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    title: text("title").notNull(),
    state: text("state", {
      enum: ["pending", "open", "locked", "scored", "completed"],
    })
      .notNull()
      .default("pending"),
    version: integer("version").notNull().default(1),
    opensAt: timestamp("opens_at", { withTimezone: true }),
    locksAt: timestamp("locks_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("game_night_rounds_restaurant_event_id_key").on(
      t.restaurantId,
      t.eventId,
      t.id,
    ),
    unique("game_night_rounds_restaurant_event_ordinal_key").on(
      t.restaurantId,
      t.eventId,
      t.ordinal,
    ),
    foreignKey({
      columns: [t.restaurantId, t.eventId],
      foreignColumns: [
        gameNightEventsTable.restaurantId,
        gameNightEventsTable.id,
      ],
    }).onDelete("cascade"),
    check("game_night_rounds_ordinal_check", sql`${t.ordinal} > 0`),
    check("game_night_rounds_version_check", sql`${t.version} > 0`),
    check(
      "game_night_rounds_state_check",
      sql`${t.state} in ('pending', 'open', 'locked', 'scored', 'completed')`,
    ),
    check(
      "game_night_rounds_timestamp_order_check",
      sql`${t.locksAt} is null or ${t.opensAt} is null or ${t.locksAt} >= ${t.opensAt}`,
    ),
    index("game_night_rounds_state_idx").on(t.restaurantId, t.eventId, t.state),
  ],
);

export const gameNightQuestionsTable = pgTable(
  "game_night_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurantsTable.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    questionType: text("question_type", {
      enum: GAME_NIGHT_QUESTION_TYPES,
    }).notNull(),
    choices: jsonb("choices"),
    correctAnswer: jsonb("correct_answer").notNull(),
    explanation: text("explanation"),
    defaultPoints: integer("default_points").notNull().default(1),
    state: text("state", { enum: ["draft", "active", "archived"] })
      .notNull()
      .default("active"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("game_night_questions_restaurant_id_id_key").on(
      t.restaurantId,
      t.id,
    ),
    check(
      "game_night_questions_type_check",
      sql`${t.questionType} in ('multiple_choice', 'true_false', 'short_text', 'number')`,
    ),
    check("game_night_questions_points_check", sql`${t.defaultPoints} >= 0`),
    check("game_night_questions_version_check", sql`${t.version} > 0`),
    check(
      "game_night_questions_state_check",
      sql`${t.state} in ('draft', 'active', 'archived')`,
    ),
    check(
      "game_night_questions_choices_array_check",
      sql`${t.choices} is null or jsonb_typeof(${t.choices}) = 'array'`,
    ),
    check(
      "game_night_questions_choices_type_check",
      sql`${t.questionType} = 'multiple_choice' or ${t.choices} is null`,
    ),
    index("game_night_questions_state_idx").on(t.restaurantId, t.state),
  ],
);

export const gameNightEventQuestionsTable = pgTable(
  "game_night_event_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurantsTable.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull(),
    roundId: uuid("round_id").notNull(),
    sourceQuestionId: uuid("source_question_id"),
    ordinal: integer("ordinal").notNull(),
    promptSnapshot: text("prompt_snapshot").notNull(),
    questionTypeSnapshot: text("question_type_snapshot", {
      enum: GAME_NIGHT_QUESTION_TYPES,
    }).notNull(),
    choicesSnapshot: jsonb("choices_snapshot"),
    correctAnswerSnapshot: jsonb("correct_answer_snapshot").notNull(),
    explanationSnapshot: text("explanation_snapshot"),
    points: integer("points").notNull().default(1),
    state: text("state", {
      enum: ["pending", "open", "locked", "scored", "void"],
    })
      .notNull()
      .default("pending"),
    version: integer("version").notNull().default(1),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("game_night_event_questions_rest_event_id_key").on(
      t.restaurantId,
      t.eventId,
      t.id,
    ),
    unique("game_night_event_questions_round_ordinal_key").on(
      t.restaurantId,
      t.eventId,
      t.roundId,
      t.ordinal,
    ),
    foreignKey({
      columns: [t.restaurantId, t.eventId],
      foreignColumns: [
        gameNightEventsTable.restaurantId,
        gameNightEventsTable.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.restaurantId, t.eventId, t.roundId],
      foreignColumns: [
        gameNightRoundsTable.restaurantId,
        gameNightRoundsTable.eventId,
        gameNightRoundsTable.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.restaurantId, t.sourceQuestionId],
      foreignColumns: [
        gameNightQuestionsTable.restaurantId,
        gameNightQuestionsTable.id,
      ],
    }).onDelete("restrict"),
    check("game_night_event_questions_ordinal_check", sql`${t.ordinal} > 0`),
    check("game_night_event_questions_points_check", sql`${t.points} >= 0`),
    check("game_night_event_questions_version_check", sql`${t.version} > 0`),
    check(
      "game_night_event_questions_type_check",
      sql`${t.questionTypeSnapshot} in ('multiple_choice', 'true_false', 'short_text', 'number')`,
    ),
    check(
      "game_night_event_questions_state_check",
      sql`${t.state} in ('pending', 'open', 'locked', 'scored', 'void')`,
    ),
    check(
      "game_night_event_questions_choices_array_check",
      sql`${t.choicesSnapshot} is null or jsonb_typeof(${t.choicesSnapshot}) = 'array'`,
    ),
    check(
      "game_night_event_questions_choices_type_check",
      sql`${t.questionTypeSnapshot} = 'multiple_choice' or ${t.choicesSnapshot} is null`,
    ),
    check(
      "game_night_event_questions_locked_requires_open_check",
      sql`${t.lockedAt} is null or ${t.openedAt} is not null`,
    ),
    check(
      "game_night_event_questions_timestamp_order_check",
      sql`${t.lockedAt} is null or ${t.lockedAt} >= ${t.openedAt}`,
    ),
    index("game_night_event_questions_state_idx").on(
      t.restaurantId,
      t.eventId,
      t.state,
    ),
  ],
);

export const gameNightTeamsTable = pgTable(
  "game_night_teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurantsTable.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull(),
    name: text("name").notNull(),
    joinCode: text("join_code").notNull(),
    state: text("state", {
      enum: ["active", "locked", "disqualified", "withdrawn"],
    })
      .notNull()
      .default("active"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("game_night_teams_restaurant_event_id_key").on(
      t.restaurantId,
      t.eventId,
      t.id,
    ),
    unique("game_night_teams_restaurant_event_name_key").on(
      t.restaurantId,
      t.eventId,
      t.name,
    ),
    unique("game_night_teams_restaurant_event_code_key").on(
      t.restaurantId,
      t.eventId,
      t.joinCode,
    ),
    foreignKey({
      columns: [t.restaurantId, t.eventId],
      foreignColumns: [
        gameNightEventsTable.restaurantId,
        gameNightEventsTable.id,
      ],
    }).onDelete("cascade"),
    check("game_night_teams_version_check", sql`${t.version} > 0`),
    check(
      "game_night_teams_state_check",
      sql`${t.state} in ('active', 'locked', 'disqualified', 'withdrawn')`,
    ),
    check(
      "game_night_teams_join_code_check",
      sql`${t.joinCode} ~ '^[A-Z0-9]{4,12}$'`,
    ),
    index("game_night_teams_state_idx").on(t.restaurantId, t.eventId, t.state),
  ],
);

export const gameNightPlayersTable = pgTable(
  "game_night_players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurantsTable.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull(),
    teamId: uuid("team_id").notNull(),
    displayName: text("display_name").notNull(),
    isCaptain: boolean("is_captain").notNull().default(false),
    state: text("state", { enum: ["active", "disconnected", "removed"] })
      .notNull()
      .default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("game_night_players_rest_event_team_id_key").on(
      t.restaurantId,
      t.eventId,
      t.teamId,
      t.id,
    ),
    foreignKey({
      columns: [t.restaurantId, t.eventId],
      foreignColumns: [
        gameNightEventsTable.restaurantId,
        gameNightEventsTable.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.restaurantId, t.eventId, t.teamId],
      foreignColumns: [
        gameNightTeamsTable.restaurantId,
        gameNightTeamsTable.eventId,
        gameNightTeamsTable.id,
      ],
    }).onDelete("cascade"),
    check(
      "game_night_players_state_check",
      sql`${t.state} in ('active', 'disconnected', 'removed')`,
    ),
    uniqueIndex("game_night_one_captain_per_team_idx")
      .on(t.restaurantId, t.eventId, t.teamId)
      .where(sql`${t.isCaptain}`),
    index("game_night_players_state_idx").on(
      t.restaurantId,
      t.eventId,
      t.teamId,
      t.state,
    ),
  ],
);

export const gameNightPlayerSessionsTable = pgTable(
  "game_night_player_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurantsTable.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull(),
    teamId: uuid("team_id").notNull(),
    playerId: uuid("player_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("game_night_player_sessions_rest_id_key").on(t.restaurantId, t.id),
    unique("game_night_player_sessions_rest_event_id_key").on(
      t.restaurantId,
      t.eventId,
      t.id,
    ),
    foreignKey({
      columns: [t.restaurantId, t.eventId],
      foreignColumns: [
        gameNightEventsTable.restaurantId,
        gameNightEventsTable.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.restaurantId, t.eventId, t.teamId, t.playerId],
      foreignColumns: [
        gameNightPlayersTable.restaurantId,
        gameNightPlayersTable.eventId,
        gameNightPlayersTable.teamId,
        gameNightPlayersTable.id,
      ],
    }).onDelete("cascade"),
    check(
      "game_night_player_sessions_expiry_check",
      sql`${t.expiresAt} > ${t.createdAt}`,
    ),
    check(
      "game_night_player_sessions_revoked_check",
      sql`${t.revokedAt} is null or ${t.revokedAt} >= ${t.createdAt}`,
    ),
    index("game_night_player_sessions_expiry_idx")
      .on(t.expiresAt)
      .where(sql`${t.revokedAt} is null`),
  ],
);

export const gameNightAnswersTable = pgTable(
  "game_night_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurantsTable.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull(),
    eventQuestionId: uuid("event_question_id").notNull(),
    teamId: uuid("team_id").notNull(),
    submittedByPlayerId: uuid("submitted_by_player_id").notNull(),
    answer: jsonb("answer").notNull(),
    state: text("state", {
      enum: ["submitted", "correct", "incorrect", "void"],
    })
      .notNull()
      .default("submitted"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    gradedAt: timestamp("graded_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    unique("game_night_answers_restaurant_event_id_key").on(
      t.restaurantId,
      t.eventId,
      t.id,
    ),
    unique("game_night_answers_rest_event_team_id_key").on(
      t.restaurantId,
      t.eventId,
      t.teamId,
      t.id,
    ),
    unique("game_night_answers_unique_submission_key").on(
      t.restaurantId,
      t.eventQuestionId,
      t.teamId,
    ),
    foreignKey({
      columns: [t.restaurantId, t.eventId],
      foreignColumns: [
        gameNightEventsTable.restaurantId,
        gameNightEventsTable.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.restaurantId, t.eventId, t.eventQuestionId],
      foreignColumns: [
        gameNightEventQuestionsTable.restaurantId,
        gameNightEventQuestionsTable.eventId,
        gameNightEventQuestionsTable.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.restaurantId, t.eventId, t.teamId, t.submittedByPlayerId],
      foreignColumns: [
        gameNightPlayersTable.restaurantId,
        gameNightPlayersTable.eventId,
        gameNightPlayersTable.teamId,
        gameNightPlayersTable.id,
      ],
    }).onDelete("restrict"),
    check("game_night_answers_version_check", sql`${t.version} > 0`),
    check(
      "game_night_answers_state_check",
      sql`${t.state} in ('submitted', 'correct', 'incorrect', 'void')`,
    ),
    check(
      "game_night_answers_graded_check",
      sql`${t.gradedAt} is null or ${t.gradedAt} >= ${t.submittedAt}`,
    ),
    index("game_night_answers_team_idx").on(
      t.restaurantId,
      t.eventId,
      t.teamId,
    ),
    index("game_night_answers_state_idx").on(
      t.restaurantId,
      t.eventId,
      t.state,
    ),
  ],
);

export const gameNightScoreLedgerTable = pgTable(
  "game_night_score_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurantsTable.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull(),
    teamId: uuid("team_id").notNull(),
    answerId: uuid("answer_id"),
    action: text("action").notNull(),
    pointsDelta: integer("points_delta").notNull(),
    reason: text("reason").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdByUserId: uuid("created_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("game_night_score_ledger_rest_event_id_key").on(
      t.restaurantId,
      t.eventId,
      t.id,
    ),
    unique("game_night_score_ledger_idempotency_key").on(
      t.restaurantId,
      t.eventId,
      t.idempotencyKey,
    ),
    foreignKey({
      columns: [t.restaurantId, t.eventId],
      foreignColumns: [
        gameNightEventsTable.restaurantId,
        gameNightEventsTable.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.restaurantId, t.eventId, t.teamId],
      foreignColumns: [
        gameNightTeamsTable.restaurantId,
        gameNightTeamsTable.eventId,
        gameNightTeamsTable.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.restaurantId, t.eventId, t.teamId, t.answerId],
      foreignColumns: [
        gameNightAnswersTable.restaurantId,
        gameNightAnswersTable.eventId,
        gameNightAnswersTable.teamId,
        gameNightAnswersTable.id,
      ],
    }).onDelete("restrict"),
    check("game_night_score_ledger_points_check", sql`${t.pointsDelta} <> 0`),
    index("game_night_score_ledger_team_idx").on(
      t.restaurantId,
      t.eventId,
      t.teamId,
      t.createdAt,
    ),
  ],
);

export const gameNightStateSnapshotsTable = pgTable(
  "game_night_state_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurantsTable.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull(),
    version: integer("version").notNull(),
    eventState: text("event_state", {
      enum: GAME_NIGHT_EVENT_STATES,
    }).notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("game_night_state_snapshots_version_key").on(
      t.restaurantId,
      t.eventId,
      t.version,
    ),
    foreignKey({
      columns: [t.restaurantId, t.eventId],
      foreignColumns: [
        gameNightEventsTable.restaurantId,
        gameNightEventsTable.id,
      ],
    }).onDelete("cascade"),
    check("game_night_state_snapshots_version_check", sql`${t.version} > 0`),
    check(
      "game_night_state_snapshots_state_check",
      sql`${t.eventState} in ('DRAFT', 'READY', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')`,
    ),
    check(
      "game_night_state_snapshots_object_check",
      sql`jsonb_typeof(${t.snapshot}) = 'object'`,
    ),
  ],
);

export const gameNightAuditLogsTable = pgTable(
  "game_night_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurantsTable.id, { onDelete: "cascade" }),
    eventId: uuid("event_id"),
    actorUserId: uuid("actor_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    actorSessionId: uuid("actor_session_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.restaurantId, t.eventId],
      foreignColumns: [
        gameNightEventsTable.restaurantId,
        gameNightEventsTable.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.restaurantId, t.actorSessionId],
      foreignColumns: [
        gameNightPlayerSessionsTable.restaurantId,
        gameNightPlayerSessionsTable.id,
      ],
    }).onDelete("no action"),
    foreignKey({
      columns: [t.restaurantId, t.eventId, t.actorSessionId],
      foreignColumns: [
        gameNightPlayerSessionsTable.restaurantId,
        gameNightPlayerSessionsTable.eventId,
        gameNightPlayerSessionsTable.id,
      ],
    }).onDelete("no action"),
    check(
      "game_night_audit_logs_details_check",
      sql`jsonb_typeof(${t.details}) = 'object'`,
    ),
    index("game_night_audit_logs_event_idx").on(
      t.restaurantId,
      t.eventId,
      t.createdAt,
    ),
  ],
);

export type GameNightEvent = typeof gameNightEventsTable.$inferSelect;
export type GameNightRound = typeof gameNightRoundsTable.$inferSelect;
export type GameNightQuestion = typeof gameNightQuestionsTable.$inferSelect;
export type GameNightEventQuestion =
  typeof gameNightEventQuestionsTable.$inferSelect;
export type GameNightTeam = typeof gameNightTeamsTable.$inferSelect;
export type GameNightPlayer = typeof gameNightPlayersTable.$inferSelect;
export type GameNightPlayerSession =
  typeof gameNightPlayerSessionsTable.$inferSelect;
export type GameNightAnswer = typeof gameNightAnswersTable.$inferSelect;
export type GameNightScoreLedgerEntry =
  typeof gameNightScoreLedgerTable.$inferSelect;
export type GameNightStateSnapshot =
  typeof gameNightStateSnapshotsTable.$inferSelect;
export type GameNightAuditLog = typeof gameNightAuditLogsTable.$inferSelect;
