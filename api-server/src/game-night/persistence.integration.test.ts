import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { and, eq, ne } from "drizzle-orm";
import {
  appendAuditLog,
  appendScoreLedgerEntry,
  createDraftEvent,
  inGameNightTransaction,
  issuePlayerSession,
  transitionPersistedEvent,
  verifyPlayerSession,
} from "./persistence.js";

// This suite is opt-in. Run `test:game-night:integration` against a
// disposable database URL; its sentinel error makes the transaction rollback.
const runIntegration =
  process.env["GAME_NIGHT_INTEGRATION"] === "1" &&
  Boolean(process.env["SUPABASE_DATABASE_URL"]);

describe("game-night persistence integration strategy", () => {
  it(
    "persists a complete scoped flow and always rolls it back",
    { skip: !runIntegration },
    async () => {
      const [{ db }, schema] = await Promise.all([
        import("@workspace/db"),
        import("@workspace/db/schema"),
      ]);
      const [restaurant] = await db
        .select({ id: schema.restaurantsTable.id })
        .from(schema.restaurantsTable)
        .limit(1);
      assert.ok(restaurant, "integration database must contain a restaurant");
      const [otherRestaurant] = await db
        .select({ id: schema.restaurantsTable.id })
        .from(schema.restaurantsTable)
        .where(ne(schema.restaurantsTable.id, restaurant.id))
        .limit(1);

      const suffix = randomUUID().replaceAll("-", "");
      const slug = `phase1-${suffix.slice(0, 20)}`;
      const teamId = randomUUID();
      const playerId = randomUUID();
      const otherTeamId = randomUUID();
      const otherPlayerId = randomUUID();
      const roundId = randomUUID();
      const eventQuestionId = randomUUID();
      const answerId = randomUUID();
      const now = Date.now();
      const rollback = new Error("intentional game-night integration rollback");
      await assert.rejects(
        inGameNightTransaction(db, async (tx) => {
          const event = await createDraftEvent(tx, {
            restaurantId: restaurant.id,
            slug,
            accessCode: `P${suffix.slice(0, 7).toUpperCase()}`,
            title: "Phase 1 rollback integration event",
            now,
          });
          assert.equal(event.status, "DRAFT");

          await tx.insert(schema.gameNightTeamsTable).values({
            id: teamId,
            restaurantId: restaurant.id,
            eventId: event.eventId,
            name: `Phase 1 ${suffix.slice(0, 8)}`,
            joinCode: `J${suffix.slice(0, 7).toUpperCase()}`,
            createdAt: new Date(now),
            updatedAt: new Date(now),
          });
          await tx.insert(schema.gameNightPlayersTable).values({
            id: playerId,
            restaurantId: restaurant.id,
            eventId: event.eventId,
            teamId,
            displayName: "Phase 1 player",
            isCaptain: true,
            joinedAt: new Date(now),
            updatedAt: new Date(now),
          });
          await tx.insert(schema.gameNightTeamsTable).values({
            id: otherTeamId,
            restaurantId: restaurant.id,
            eventId: event.eventId,
            name: `Phase 1 other ${suffix.slice(0, 8)}`,
            joinCode: `K${suffix.slice(0, 7).toUpperCase()}`,
            createdAt: new Date(now),
            updatedAt: new Date(now),
          });
          await tx.insert(schema.gameNightPlayersTable).values({
            id: otherPlayerId,
            restaurantId: restaurant.id,
            eventId: event.eventId,
            teamId: otherTeamId,
            displayName: "Phase 1 other player",
            isCaptain: true,
            joinedAt: new Date(now),
            updatedAt: new Date(now),
          });
          await tx.insert(schema.gameNightRoundsTable).values({
            id: roundId,
            restaurantId: restaurant.id,
            eventId: event.eventId,
            ordinal: 1,
            title: "Phase 1 round",
            createdAt: new Date(now),
            updatedAt: new Date(now),
          });
          await tx.insert(schema.gameNightEventQuestionsTable).values({
            id: eventQuestionId,
            restaurantId: restaurant.id,
            eventId: event.eventId,
            roundId,
            ordinal: 1,
            promptSnapshot: "Phase 1 question",
            questionTypeSnapshot: "short_text",
            correctAnswerSnapshot: { value: "correct" },
            points: 10,
            createdAt: new Date(now),
            updatedAt: new Date(now),
          });
          await tx.insert(schema.gameNightAnswersTable).values({
            id: answerId,
            restaurantId: restaurant.id,
            eventId: event.eventId,
            eventQuestionId,
            teamId: otherTeamId,
            submittedByPlayerId: otherPlayerId,
            answer: { value: "correct" },
            submittedAt: new Date(now),
          });

          const scope = {
            restaurantId: restaurant.id,
            eventId: event.eventId,
            teamId,
            playerId,
          };
          const session = await issuePlayerSession(tx, scope, now, 60_000);
          assert.equal(await verifyPlayerSession(tx, scope, session.token, now), true);
          await appendAuditLog(tx, {
            restaurantId: restaurant.id,
            actorSessionId: session.id,
            action: "TEMPORARY_SESSION_ISSUED",
            entityType: "player_session",
            now: now + 1,
          });

          if (otherRestaurant) {
            const foreignEvent = await createDraftEvent(tx, {
              restaurantId: otherRestaurant.id,
              slug: `phase1-foreign-${suffix.slice(0, 12)}`,
              accessCode: `R${suffix.slice(0, 7).toUpperCase()}`,
              title: "Phase 1 foreign event",
              now: now + 1,
            });
            const foreignTeamId = randomUUID();
            const foreignPlayerId = randomUUID();
            await tx.insert(schema.gameNightTeamsTable).values({
              id: foreignTeamId,
              restaurantId: otherRestaurant.id,
              eventId: foreignEvent.eventId,
              name: `Phase 1 foreign ${suffix.slice(0, 8)}`,
              joinCode: `S${suffix.slice(0, 7).toUpperCase()}`,
              createdAt: new Date(now + 1),
              updatedAt: new Date(now + 1),
            });
            await tx.insert(schema.gameNightPlayersTable).values({
              id: foreignPlayerId,
              restaurantId: otherRestaurant.id,
              eventId: foreignEvent.eventId,
              teamId: foreignTeamId,
              displayName: "Phase 1 foreign player",
              isCaptain: true,
              joinedAt: new Date(now + 1),
              updatedAt: new Date(now + 1),
            });
            const foreignSession = await issuePlayerSession(
              tx,
              {
                restaurantId: otherRestaurant.id,
                eventId: foreignEvent.eventId,
                teamId: foreignTeamId,
                playerId: foreignPlayerId,
              },
              now + 1,
              60_000,
            );
            await assert.rejects(
              appendAuditLog(tx, {
                restaurantId: restaurant.id,
                actorSessionId: foreignSession.id,
                action: "TEMPORARY_SESSION_ISSUED",
                entityType: "player_session",
                now: now + 1,
              }),
              isSessionNotFound,
            );
          } else {
            await assert.rejects(
              appendAuditLog(tx, {
                restaurantId: restaurant.id,
                actorSessionId: randomUUID(),
                action: "TEMPORARY_SESSION_ISSUED",
                entityType: "player_session",
                now: now + 1,
              }),
              isSessionNotFound,
            );
          }

          const ready = await transitionPersistedEvent(
            tx,
            event,
            { to: "READY", expectedVersion: 1 },
            now + 1,
          );
          assert.equal(ready.status, "READY");

          const scoreInput = {
            restaurantId: restaurant.id,
            eventId: event.eventId,
            teamId,
            command: {
              teamId,
              action: "CORRECT_ANSWER",
              reason: "Integration score",
              quantity: 1,
              idempotencyKey: `score-${suffix}`,
            },
            rules: [{ action: "CORRECT_ANSWER", pointsDelta: 10 }],
            now: now + 2,
          };
          const firstScore = await appendScoreLedgerEntry(tx, scoreInput);
          const retryScore = await appendScoreLedgerEntry(tx, scoreInput);
          assert.equal(firstScore.duplicate, false);
          assert.equal(retryScore.duplicate, true);
          assert.equal(retryScore.entry.id, firstScore.entry.id);
          assert.equal(retryScore.entry.pointsDelta, 10);
          await assert.rejects(
            appendScoreLedgerEntry(tx, { ...scoreInput, answerId }),
            (error: unknown) =>
              error instanceof Error &&
              "code" in error &&
              error.code === "ANSWER_NOT_FOUND",
          );

          const otherEvent = await createDraftEvent(tx, {
            restaurantId: restaurant.id,
            slug: `phase1-other-${suffix.slice(0, 14)}`,
            accessCode: `Q${suffix.slice(0, 7).toUpperCase()}`,
            title: "Phase 1 other event",
            now: now + 3,
          });
          await assert.rejects(
            appendAuditLog(tx, {
              restaurantId: restaurant.id,
              eventId: otherEvent.eventId,
              actorSessionId: session.id,
              action: "TEMPORARY_SESSION_ISSUED",
              entityType: "player_session",
              now: now + 3,
            }),
            isSessionNotFound,
          );

          await appendAuditLog(tx, {
            restaurantId: restaurant.id,
            eventId: event.eventId,
            actorSessionId: session.id,
            action: "SCORE_RECORDED",
            entityType: "score_ledger",
            entityId: firstScore.entry.id,
            details: { source: "integration-test" },
            now: now + 4,
          });
          throw rollback;
        }),
        (error: unknown) => error === rollback,
      );
      const [rolledBack] = await db
        .select({ id: schema.gameNightEventsTable.id })
        .from(schema.gameNightEventsTable)
        .where(
          and(
            eq(
              schema.gameNightEventsTable.restaurantId,
              restaurant.id,
            ),
            eq(schema.gameNightEventsTable.slug, slug),
          ),
        )
        .limit(1);
      assert.equal(rolledBack, undefined);
    },
  );
});

function isSessionNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "SESSION_NOT_FOUND"
  );
}