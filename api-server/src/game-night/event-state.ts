import { GameNightDomainError } from "./errors.js";

export const EVENT_STATUSES = [
  "DRAFT",
  "READY",
  "LIVE",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

export interface EventState {
  readonly status: EventStatus;
  /** Optimistic-lock version persisted with the event row. */
  readonly version: number;
  readonly readyAt: number | null;
  readonly startedAt: number | null;
  readonly completedAt: number | null;
  readonly cancelledAt: number | null;
}

export interface EventTransitionCommand {
  readonly to: EventStatus;
  /** The version observed by the caller and used in the persistence WHERE. */
  readonly expectedVersion: number;
}

/**
 * The caller persists `state` with `WHERE version = expectedVersion`, setting
 * version to `nextVersion`. A zero-row update is a concurrent-write conflict.
 */
export interface EventTransitionResult {
  readonly expectedVersion: number;
  readonly nextVersion: number;
  readonly state: EventState;
}

const ALLOWED_TRANSITIONS: Readonly<Record<EventStatus, readonly EventStatus[]>> = {
  DRAFT: ["READY", "CANCELLED"],
  READY: ["LIVE", "CANCELLED"],
  LIVE: ["PAUSED", "COMPLETED", "CANCELLED"],
  PAUSED: ["LIVE", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function createDraftEventState(): EventState {
  return {
    status: "DRAFT",
    version: 1,
    readyAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
  };
}

export function canTransitionEvent(
  from: EventStatus,
  to: EventStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Applies a requested lifecycle change. Timestamps are supplied by the server,
 * never accepted as part of the client command.
 */
export function transitionEvent(
  state: Readonly<EventState>,
  command: Readonly<EventTransitionCommand>,
  now: number,
): EventTransitionResult {
  assertTimestamp(now);
  assertVersion(state.version, "Event version");
  assertVersion(command.expectedVersion, "Expected version");
  if (command.expectedVersion !== state.version) {
    throw new GameNightDomainError(
      "EVENT_VERSION_CONFLICT",
      `Expected event version ${command.expectedVersion}, found ${state.version}`,
    );
  }
  assertNotBackwards(state, now);
  if (!canTransitionEvent(state.status, command.to)) {
    throw new GameNightDomainError(
      "INVALID_EVENT_TRANSITION",
      `Cannot transition a game night from ${state.status} to ${command.to}`,
    );
  }

  const nextVersion = state.version + 1;
  let nextState: EventState;
  switch (command.to) {
    case "READY":
      nextState = { ...state, status: "READY", version: nextVersion, readyAt: now };
      break;
    case "LIVE":
      nextState = {
        ...state,
        status: "LIVE",
        version: nextVersion,
        startedAt: state.startedAt ?? now,
      };
      break;
    case "PAUSED":
      nextState = { ...state, status: "PAUSED", version: nextVersion };
      break;
    case "COMPLETED":
      nextState = {
        ...state,
        status: "COMPLETED",
        version: nextVersion,
        completedAt: now,
      };
      break;
    case "CANCELLED":
      nextState = {
        ...state,
        status: "CANCELLED",
        version: nextVersion,
        cancelledAt: now,
      };
      break;
    case "DRAFT":
      // No status is allowed to transition back to DRAFT.
      throw new GameNightDomainError(
        "INVALID_EVENT_TRANSITION",
        `Cannot transition a game night from ${state.status} to DRAFT`,
      );
  }
  return { expectedVersion: command.expectedVersion, nextVersion, state: nextState };
}

function assertTimestamp(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new GameNightDomainError(
      "INVALID_TIMESTAMP",
      "The server timestamp must be a non-negative finite number",
    );
  }
}

function assertNotBackwards(state: Readonly<EventState>, now: number): void {
  const latestTimestamp = Math.max(
    ...[
      state.readyAt,
      state.startedAt,
      state.completedAt,
      state.cancelledAt,
    ].filter((value): value is number => value !== null),
  );
  if (latestTimestamp !== -Infinity && now < latestTimestamp) {
    throw new GameNightDomainError(
      "BACKWARDS_SERVER_TIMESTAMP",
      "Transition timestamp cannot precede an existing event timestamp",
    );
  }
}

function assertVersion(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new GameNightDomainError(
      "INVALID_EVENT_VERSION",
      `${label} must be a non-negative safe integer`,
    );
  }
}