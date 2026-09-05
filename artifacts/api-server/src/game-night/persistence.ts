import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  gameNightAuditLogsTable,
  gameNightAnswersTable,
  gameNightEventsTable,
  gameNightPlayerSessionsTable,
  gameNightPlayersTable,
  gameNightScoreLedgerTable,
  gameNightTeamsTable,
  restaurantsTable,
} from "@workspace/db/schema";
import type * as schema from "@workspace/db/schema";
import { GameNightDomainError } from "./errors.js";
import {
  createDraftEventState,
  transitionEvent,
  type EventState,
  type EventStatus,
  type EventTransitionCommand,
} from "./event-state.js";
import {
  createScoreLedgerEntry,
  type ScoreRule,
  type ScoreLedgerEntry,
} from "./scoring.js";
import {
  hashTemporarySessionToken,
  issueTemporarySession,
  verifyTemporarySessionToken,
} from "./temporary-session.js";

/**
 * Services receive a Drizzle client or the transaction object supplied by
 * `database.transaction(...)`. Callers that compose writes should pass the
 * latter so all checks and writes share one transaction.
 */
export type GameNightDatabase = NodePgDatabase<typeof schema>;

/** Run a composed game-night command atomically. */
export async function inGameNightTransaction<T>(
  database: GameNightDatabase,
  work: (transaction: GameNightDatabase) => Promise<T>,
): Promise<T> {
  return database.transaction((transaction) =>
    work(transaction as unknown as GameNightDatabase),
  );
}

export interface EventScope {
  readonly restaurantId: string;
  readonly eventId: string;
}

export interface TeamScope extends EventScope {
  readonly teamId: string;
}

export interface PlayerScope extends TeamScope {
  readonly playerId: string;
}

export interface CreateDraftEventInput {
  readonly restaurantId: string;
  readonly slug: string;
  readonly accessCode: string;
  readonly title: string;
  readonly now: number;
}

export interface PersistedEventState extends EventScope, EventState {
  readonly id: string;
}

export interface IssuedPlayerSession extends PlayerScope {
  readonly id: string;
  readonly token: string;
  readonly expiresAt: number;
}

export interface AppendScoreInput extends TeamScope {
  readonly command: unknown;
  readonly rules: readonly ScoreRule[];
  readonly now: number;
  readonly answerId?: string;
  readonly createdByUserId?: string;
}

export interface PersistedScoreLedgerEntry
  extends Omit<ScoreLedgerEntry, "quantity">,
    EventScope {
  readonly answerId: string | null;
  readonly createdByUserId: string | null;
}

export interface AppendAuditInput {
  readonly restaurantId: string;
  readonly eventId?: string;
  readonly actorUserId?: string;
  readonly actorSessionId?: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId?: string;
  readonly details?: Record<string, unknown>;
  readonly now: number;
}

export async function createDraftEvent(
  database: GameNightDatabase,
  input: CreateDraftEventInput,
): Promise<PersistedEventState> {
  assertText(input.slug, "slug");
  assertText(input.accessCode, "accessCode");
  assertText(input.title, "title");
  assertTimestamp(input.now);
  await requireRestaurant(database, input.restaurantId);
  const state = createDraftEventState();
  const [row] = await database
    .insert(gameNightEventsTable)
    .values({
      restaurantId: input.restaurantId,
      slug: input.slug,
      accessCode: input.accessCode,
      title: input.title,
      state: state.status,
      version: state.version,
      createdAt: new Date(input.now),
      updatedAt: new Date(input.now),
    })
    .returning();
  if (!row) throw persistenceError("Event draft insert returned no row");
  return mapPersistedEvent(row);
}

/**
 * Reads the scoped event, applies the domain transition, then writes using the
 * observed version in its WHERE clause. A concurrent update therefore affects
 * no rows and is reported as EVENT_VERSION_CONFLICT.
 */
export async function transitionPersistedEvent(
  database: GameNightDatabase,
  scope: EventScope,
  command: EventTransitionCommand,
  now: number,
): Promise<PersistedEventState> {
  assertTimestamp(now);
  const event = await requireEvent(database, scope);
  const transition = transitionEvent(mapPersistedEvent(event), command, now);
  const [updated] = await database
    .update(gameNightEventsTable)
    .set({
      state: transition.state.status,
      version: transition.nextVersion,
      readyAt: toDate(transition.state.readyAt),
      startedAt: toDate(transition.state.startedAt),
      completedAt: toDate(transition.state.completedAt),
      cancelledAt: toDate(transition.state.cancelledAt),
      updatedAt: new Date(now),
    })
    .where(
      and(
        eq(gameNightEventsTable.restaurantId, scope.restaurantId),
        eq(gameNightEventsTable.id, scope.eventId),
        eq(gameNightEventsTable.version, transition.expectedVersion),
      ),
    )
    .returning();
  if (!updated) {
    throw new GameNightDomainError(
      "EVENT_VERSION_CONFLICT",
      "The event changed before the requested transition could be saved",
    );
  }
  return mapPersistedEvent(updated);
}

export async function issuePlayerSession(
  database: GameNightDatabase,
  scope: PlayerScope,
  now: number,
  ttlMs?: number,
): Promise<IssuedPlayerSession> {
  await requirePlayer(database, scope);
  const issued = issueTemporarySession(now, ttlMs);
  const [session] = await database
    .insert(gameNightPlayerSessionsTable)
    .values({
      ...scope,
      tokenHash: issued.tokenHash,
      expiresAt: new Date(issued.expiresAt),
      createdAt: new Date(now),
    })
    .returning({ id: gameNightPlayerSessionsTable.id });
  if (!session) throw persistenceError("Player session insert returned no row");
  return { ...scope, id: session.id, token: issued.token, expiresAt: issued.expiresAt };
}

export async function verifyPlayerSession(
  database: GameNightDatabase,
  scope: PlayerScope,
  token: string | undefined,
  now: number,
): Promise<boolean> {
  assertTimestamp(now);
  if (!token) return false;
  const tokenHash = hashTemporarySessionToken(token);
  const [session] = await database
    .select({
      tokenHash: gameNightPlayerSessionsTable.tokenHash,
      expiresAt: gameNightPlayerSessionsTable.expiresAt,
      revokedAt: gameNightPlayerSessionsTable.revokedAt,
    })
    .from(gameNightPlayerSessionsTable)
    .where(and(scopePlayer(scope), eq(gameNightPlayerSessionsTable.tokenHash, tokenHash)))
    .limit(1);
  return Boolean(
    session &&
      verifyTemporarySessionToken(token, {
        tokenHash: session.tokenHash,
        expiresAt: session.expiresAt.getTime(),
        revokedAt: session.revokedAt?.getTime() ?? null,
      }, now),
  );
}

export async function touchPlayerSession(
  database: GameNightDatabase,
  scope: PlayerScope,
  token: string,
  now: number,
): Promise<boolean> {
  assertTimestamp(now);
  const [row] = await database
    .update(gameNightPlayerSessionsTable)
    .set({ lastSeenAt: new Date(now) })
    .where(and(
      scopePlayer(scope),
      eq(gameNightPlayerSessionsTable.tokenHash, hashTemporarySessionToken(token)),
      isNull(gameNightPlayerSessionsTable.revokedAt),
      gt(gameNightPlayerSessionsTable.expiresAt, new Date(now)),
    ))
    .returning({ id: gameNightPlayerSessionsTable.id });
  return row !== undefined;
}

export async function revokePlayerSession(
  database: GameNightDatabase,
  scope: PlayerScope,
  token: string,
  now: number,
): Promise<boolean> {
  assertTimestamp(now);
  const [row] = await database
    .update(gameNightPlayerSessionsTable)
    .set({ revokedAt: new Date(now) })
    .where(and(
      scopePlayer(scope),
      eq(gameNightPlayerSessionsTable.tokenHash, hashTemporarySessionToken(token)),
      isNull(gameNightPlayerSessionsTable.revokedAt),
    ))
    .returning({ id: gameNightPlayerSessionsTable.id });
  return row !== undefined;
}

export async function appendScoreLedgerEntry(
  database: GameNightDatabase,
  input: AppendScoreInput,
): Promise<{ entry: PersistedScoreLedgerEntry; duplicate: boolean }> {
  await requireTeam(database, input);
  if (input.answerId) await requireAnswer(database, input, input.answerId);
  const entry = createScoreLedgerEntry(randomUUID(), input.command, input.rules, input.now);
  if (entry.teamId !== input.teamId) {
    throw new GameNightDomainError("SCORE_TEAM_MISMATCH", "Score command team does not match its event scope");
  }
  const [created] = await database
    .insert(gameNightScoreLedgerTable)
    .values({
      id: entry.id,
      restaurantId: input.restaurantId,
      eventId: input.eventId,
      teamId: input.teamId,
      answerId: input.answerId,
      action: entry.action,
      pointsDelta: entry.pointsDelta,
      reason: entry.reason,
      idempotencyKey: entry.idempotencyKey,
      createdByUserId: input.createdByUserId,
      createdAt: new Date(entry.createdAt),
    })
    .onConflictDoNothing({
      target: [
        gameNightScoreLedgerTable.restaurantId,
        gameNightScoreLedgerTable.eventId,
        gameNightScoreLedgerTable.idempotencyKey,
      ],
    })
    .returning();
  if (created) return { entry: mapPersistedScoreLedgerEntry(created), duplicate: false };

  const [existing] = await database
    .select()
    .from(gameNightScoreLedgerTable)
    .where(and(
      eq(gameNightScoreLedgerTable.restaurantId, input.restaurantId),
      eq(gameNightScoreLedgerTable.eventId, input.eventId),
      eq(gameNightScoreLedgerTable.idempotencyKey, entry.idempotencyKey),
    ))
    .limit(1);
  if (!existing) throw persistenceError("Idempotent score insert did not return its existing row");
  assertIdempotentScoreMatches(existing, entry);
  return { entry: mapPersistedScoreLedgerEntry(existing), duplicate: true };
}

export async function appendAuditLog(
  database: GameNightDatabase,
  input: AppendAuditInput,
): Promise<string> {
  assertText(input.action, "action");
  assertText(input.entityType, "entityType");
  assertTimestamp(input.now);
  await requireRestaurant(database, input.restaurantId);
  if (input.eventId) await requireEvent(database, input as EventScope);
  if (input.actorSessionId) {
    const [session] = await database.select({ id: gameNightPlayerSessionsTable.id }).from(gameNightPlayerSessionsTable)
      .where(
        input.eventId
          ? and(
              eq(gameNightPlayerSessionsTable.restaurantId, input.restaurantId),
              eq(gameNightPlayerSessionsTable.eventId, input.eventId),
              eq(gameNightPlayerSessionsTable.id, input.actorSessionId),
            )
          : and(
              eq(gameNightPlayerSessionsTable.restaurantId, input.restaurantId),
              eq(gameNightPlayerSessionsTable.id, input.actorSessionId),
            ),
      ).limit(1);
    if (!session) throw new GameNightDomainError(
      "SESSION_NOT_FOUND",
      input.eventId
        ? "Temporary session does not belong to event and restaurant"
        : "Temporary session does not belong to restaurant",
    );
  }
  const [row] = await database.insert(gameNightAuditLogsTable).values({
    restaurantId: input.restaurantId, eventId: input.eventId, actorUserId: input.actorUserId,
    actorSessionId: input.actorSessionId, action: input.action, entityType: input.entityType,
    entityId: input.entityId, details: input.details ?? {}, createdAt: new Date(input.now),
  }).returning({ id: gameNightAuditLogsTable.id });
  if (!row) throw persistenceError("Audit insert returned no row");
  return row.id;
}

export function mapPersistedEvent(
  row: typeof gameNightEventsTable.$inferSelect,
): PersistedEventState {
  return { id: row.id, restaurantId: row.restaurantId, eventId: row.id, status: row.state as EventStatus,
    version: row.version, readyAt: row.readyAt?.getTime() ?? null, startedAt: row.startedAt?.getTime() ?? null,
    completedAt: row.completedAt?.getTime() ?? null, cancelledAt: row.cancelledAt?.getTime() ?? null };
}

export function mapPersistedScoreLedgerEntry(
  row: typeof gameNightScoreLedgerTable.$inferSelect,
): PersistedScoreLedgerEntry {
  return { id: row.id, restaurantId: row.restaurantId, eventId: row.eventId, teamId: row.teamId,
    answerId: row.answerId, createdByUserId: row.createdByUserId, action: row.action, reason: row.reason,
    idempotencyKey: row.idempotencyKey, pointsDelta: row.pointsDelta, createdAt: row.createdAt.getTime() };
}

/**
 * An idempotency key identifies one immutable scoring decision. Retrying the
 * same decision returns its original row; changing its material effect is an
 * explicit client error rather than a silent success.
 */
export function assertIdempotentScoreMatches(
  existing: Pick<
    typeof gameNightScoreLedgerTable.$inferSelect,
    "teamId" | "action" | "reason" | "pointsDelta"
  >,
  attempted: Pick<ScoreLedgerEntry, "teamId" | "action" | "reason" | "pointsDelta">,
): void {
  if (
    existing.teamId !== attempted.teamId ||
    existing.action !== attempted.action ||
    existing.reason !== attempted.reason ||
    existing.pointsDelta !== attempted.pointsDelta
  ) {
    throw new GameNightDomainError(
      "IDEMPOTENCY_KEY_REUSED",
      "Idempotency key was previously used for a different score decision",
    );
  }
}

async function requireRestaurant(database: GameNightDatabase, restaurantId: string): Promise<void> {
  const [restaurant] = await database.select({ id: restaurantsTable.id }).from(restaurantsTable)
    .where(eq(restaurantsTable.id, restaurantId)).limit(1);
  if (!restaurant) throw new GameNightDomainError("RESTAURANT_NOT_FOUND", "Restaurant was not found");
}

async function requireEvent(database: GameNightDatabase, scope: EventScope): Promise<typeof gameNightEventsTable.$inferSelect> {
  const [event] = await database.select().from(gameNightEventsTable).where(and(
    eq(gameNightEventsTable.restaurantId, scope.restaurantId), eq(gameNightEventsTable.id, scope.eventId),
  )).limit(1);
  if (!event) throw new GameNightDomainError("EVENT_NOT_FOUND", "Event does not belong to restaurant");
  return event;
}

async function requireTeam(database: GameNightDatabase, scope: TeamScope): Promise<void> {
  const [team] = await database.select({ id: gameNightTeamsTable.id }).from(gameNightTeamsTable).where(and(
    eq(gameNightTeamsTable.restaurantId, scope.restaurantId), eq(gameNightTeamsTable.eventId, scope.eventId), eq(gameNightTeamsTable.id, scope.teamId),
  )).limit(1);
  if (!team) throw new GameNightDomainError("TEAM_NOT_FOUND", "Team does not belong to event and restaurant");
}

async function requirePlayer(database: GameNightDatabase, scope: PlayerScope): Promise<void> {
  const [player] = await database.select({ id: gameNightPlayersTable.id }).from(gameNightPlayersTable).where(and(
    eq(gameNightPlayersTable.restaurantId, scope.restaurantId), eq(gameNightPlayersTable.eventId, scope.eventId),
    eq(gameNightPlayersTable.teamId, scope.teamId), eq(gameNightPlayersTable.id, scope.playerId),
  )).limit(1);
  if (!player) throw new GameNightDomainError("PLAYER_NOT_FOUND", "Player does not belong to team, event, and restaurant");
}

async function requireAnswer(
  database: GameNightDatabase,
  scope: TeamScope,
  answerId: string,
): Promise<void> {
  const [answer] = await database.select({ id: gameNightAnswersTable.id }).from(gameNightAnswersTable).where(and(
    eq(gameNightAnswersTable.restaurantId, scope.restaurantId),
    eq(gameNightAnswersTable.eventId, scope.eventId),
    eq(gameNightAnswersTable.teamId, scope.teamId),
    eq(gameNightAnswersTable.id, answerId),
  )).limit(1);
  if (!answer) throw new GameNightDomainError("ANSWER_NOT_FOUND", "Answer does not belong to team, event, and restaurant");
}

function scopePlayer(scope: PlayerScope) {
  return and(eq(gameNightPlayerSessionsTable.restaurantId, scope.restaurantId), eq(gameNightPlayerSessionsTable.eventId, scope.eventId),
    eq(gameNightPlayerSessionsTable.teamId, scope.teamId), eq(gameNightPlayerSessionsTable.playerId, scope.playerId));
}
function toDate(value: number | null): Date | null { return value === null ? null : new Date(value); }
function assertTimestamp(value: number): void { if (!Number.isFinite(value) || value < 0) throw new GameNightDomainError("INVALID_TIMESTAMP", "Timestamp must be non-negative"); }
function assertText(value: string, field: string): void { if (!value.trim()) throw new GameNightDomainError("INVALID_INPUT", `${field} must be non-empty`); }
function persistenceError(message: string): GameNightDomainError { return new GameNightDomainError("PERSISTENCE_ERROR", message); }