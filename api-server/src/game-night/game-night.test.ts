import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GameNightDomainError,
  calculatePointsDelta,
  createDraftEventState,
  createScoreLedgerEntry,
  createTimer,
  issueTemporarySession,
  pauseTimer,
  remainingTimerMs,
  resumeTimer,
  startTimer,
  transitionEvent,
  verifyTemporarySessionToken,
} from "./index.js";

describe("event state", () => {
  it("allows the authoritative lifecycle and rejects invalid transitions", () => {
    let state = createDraftEventState();
    state = transitionEvent(state, { to: "READY", expectedVersion: 1 }, 10).state;
    state = transitionEvent(state, { to: "LIVE", expectedVersion: 2 }, 20).state;
    state = transitionEvent(state, { to: "PAUSED", expectedVersion: 3 }, 30).state;
    state = transitionEvent(state, { to: "LIVE", expectedVersion: 4 }, 40).state;
    state = transitionEvent(state, { to: "COMPLETED", expectedVersion: 5 }, 50).state;

    assert.equal(state.startedAt, 20);
    assert.equal(state.completedAt, 50);
    assert.equal(state.version, 6);
    assert.throws(
      () => transitionEvent(state, { to: "LIVE", expectedVersion: 6 }, 60),
      (error) =>
        error instanceof GameNightDomainError &&
        error.code === "INVALID_EVENT_TRANSITION",
    );
  });

  it("permits cancellation before completion", () => {
    const cancelled = transitionEvent(
      createDraftEventState(),
      { to: "CANCELLED", expectedVersion: 1 },
      5,
    ).state;
    assert.equal(cancelled.cancelledAt, 5);
  });

  it("rejects stale versions and backwards server timestamps", () => {
    const ready = transitionEvent(
      createDraftEventState(),
      { to: "READY", expectedVersion: 1 },
      10,
    ).state;
    assert.throws(
      () => transitionEvent(ready, { to: "LIVE", expectedVersion: 1 }, 11),
      (error) =>
        error instanceof GameNightDomainError &&
        error.code === "EVENT_VERSION_CONFLICT",
    );
    assert.throws(
      () => transitionEvent(ready, { to: "LIVE", expectedVersion: 2 }, 9),
      (error) =>
        error instanceof GameNightDomainError &&
        error.code === "BACKWARDS_SERVER_TIMESTAMP",
    );
  });
});

describe("timer", () => {
  it("derives remaining time and shifts only the deadline on resume", () => {
    const running = startTimer(createTimer(10_000), 1_000);
    assert.equal(remainingTimerMs(running, 4_000), 7_000);

    const paused = pauseTimer(running, 4_000);
    assert.equal(remainingTimerMs(paused, 50_000), 7_000);

    const resumed = resumeTimer(paused, 9_000);
    assert.equal(resumed.deadlineAt, 16_000);
    assert.equal(remainingTimerMs(resumed, 10_000), 6_000);
  });

  it("rejects pausing an expired timer and backwards reads", () => {
    const running = startTimer(createTimer(1_000), 10_000);
    assert.throws(
      () => pauseTimer(running, 11_000),
      (error) =>
        error instanceof GameNightDomainError && error.code === "TIMER_EXPIRED",
    );
    assert.throws(
      () => remainingTimerMs(running, 9_999),
      (error) =>
        error instanceof GameNightDomainError &&
        error.code === "BACKWARDS_SERVER_TIMESTAMP",
    );
  });
});

describe("scoring", () => {
  const rules = [{ action: "CORRECT_ANSWER", pointsDelta: 10 }];

  it("calculates ledger points from server rules", () => {
    const entry = createScoreLedgerEntry(
      "entry-1",
      {
        teamId: "team-1",
        action: "CORRECT_ANSWER",
        reason: "Correct final answer",
        quantity: 2,
        idempotencyKey: "score-command-1",
      },
      rules,
      100,
    );
    assert.equal(entry.pointsDelta, 20);
    assert.equal(calculatePointsDelta(entry, rules), 20);
  });

  it("rejects client-supplied computed points", () => {
    assert.throws(
      () =>
        createScoreLedgerEntry(
          "entry-1",
          {
            teamId: "team-1",
            action: "CORRECT_ANSWER",
            reason: "Correct final answer",
            quantity: 1,
            idempotencyKey: "score-command-1",
            pointsDelta: 1_000_000,
          },
          rules,
          100,
        ),
      (error) =>
        error instanceof GameNightDomainError &&
        error.code === "INVALID_SCORE_COMMAND",
    );
  });

  it("requires an idempotency key", () => {
    assert.throws(
      () =>
        createScoreLedgerEntry(
          "entry-1",
          {
            teamId: "team-1",
            action: "CORRECT_ANSWER",
            reason: "Correct final answer",
            quantity: 1,
          },
          rules,
          100,
        ),
      (error) =>
        error instanceof GameNightDomainError &&
        error.code === "INVALID_SCORE_COMMAND",
    );
  });
});

describe("temporary sessions", () => {
  it("stores only a digest and enforces expiry", () => {
    const issued = issueTemporarySession(1_000, 5_000);
    assert.notEqual(issued.token, issued.tokenHash);
    assert.equal(verifyTemporarySessionToken(issued.token, issued, 5_999), true);
    assert.equal(verifyTemporarySessionToken(issued.token, issued, 6_000), false);
    assert.equal(verifyTemporarySessionToken(`${issued.token}x`, issued, 2_000), false);
    assert.equal(
      verifyTemporarySessionToken(
        issued.token,
        { ...issued, revokedAt: 2_000 },
        2_000,
      ),
      false,
    );
  });
});