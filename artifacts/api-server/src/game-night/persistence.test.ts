import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertIdempotentScoreMatches,
  mapPersistedEvent,
  mapPersistedScoreLedgerEntry,
} from "./persistence.js";

describe("persistence row mappings", () => {
  it("maps database event timestamps to domain milliseconds", () => {
    const mapped = mapPersistedEvent({
      id: "event-id",
      restaurantId: "restaurant-id",
      state: "LIVE",
      version: 3,
      readyAt: new Date(1_000),
      startedAt: new Date(2_000),
      completedAt: null,
      cancelledAt: null,
    } as never);

    assert.deepEqual(mapped, {
      id: "event-id",
      eventId: "event-id",
      restaurantId: "restaurant-id",
      status: "LIVE",
      version: 3,
      readyAt: 1_000,
      startedAt: 2_000,
      completedAt: null,
      cancelledAt: null,
    });
  });

  it("maps persisted server-computed ledger fields without inventing quantity", () => {
    const mapped = mapPersistedScoreLedgerEntry({
      id: "ledger-id",
      restaurantId: "restaurant-id",
      eventId: "event-id",
      teamId: "team-id",
      answerId: null,
      createdByUserId: null,
      action: "CORRECT_ANSWER",
      pointsDelta: 10,
      reason: "Correct answer",
      idempotencyKey: "key-1",
      createdAt: new Date(3_000),
    } as never);

    assert.equal(mapped.createdAt, 3_000);
    assert.equal(mapped.pointsDelta, 10);
    assert.equal("quantity" in mapped, false);
  });

  it("rejects an idempotency retry whose scoring decision differs", () => {
    assert.throws(
      () =>
        assertIdempotentScoreMatches(
          {
            teamId: "team-a",
            action: "CORRECT_ANSWER",
            reason: "Correct",
            pointsDelta: 10,
          },
          {
            teamId: "team-b",
            action: "CORRECT_ANSWER",
            reason: "Correct",
            pointsDelta: 10,
          },
        ),
      (error) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "IDEMPOTENCY_KEY_REUSED",
    );
  });
});