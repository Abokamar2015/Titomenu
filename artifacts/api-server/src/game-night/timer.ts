import { GameNightDomainError } from "./errors.js";

/**
 * A timer is projected from timestamps at read time. It therefore needs writes
 * only when it starts, pauses, or resumes, rather than once per second.
 */
export interface GameTimer {
  readonly durationMs: number;
  readonly startedAt: number | null;
  readonly deadlineAt: number | null;
  readonly pausedAt: number | null;
}

export function createTimer(durationMs: number): GameTimer {
  assertDuration(durationMs);
  return {
    durationMs,
    startedAt: null,
    deadlineAt: null,
    pausedAt: null,
  };
}

export function startTimer(timer: Readonly<GameTimer>, now: number): GameTimer {
  assertNow(now);
  if (timer.startedAt !== null) {
    throw new GameNightDomainError(
      "TIMER_ALREADY_STARTED",
      "The timer has already started",
    );
  }
  assertDuration(timer.durationMs);
  return {
    ...timer,
    startedAt: now,
    deadlineAt: now + timer.durationMs,
    pausedAt: null,
  };
}

export function pauseTimer(timer: Readonly<GameTimer>, now: number): GameTimer {
  assertNow(now);
  assertRunning(timer);
  if (now < timer.startedAt) {
    throw new GameNightDomainError(
      "BACKWARDS_SERVER_TIMESTAMP",
      "Pause time cannot be before timer start time",
    );
  }
  if (now >= timer.deadlineAt) {
    throw new GameNightDomainError(
      "TIMER_EXPIRED",
      "An expired timer cannot be paused",
    );
  }
  return { ...timer, pausedAt: now };
}

export function resumeTimer(timer: Readonly<GameTimer>, now: number): GameTimer {
  assertNow(now);
  if (
    timer.startedAt === null ||
    timer.deadlineAt === null ||
    timer.pausedAt === null
  ) {
    throw new GameNightDomainError(
      "TIMER_NOT_PAUSED",
      "Only a paused timer can be resumed",
    );
  }
  if (now < timer.pausedAt) {
    throw new GameNightDomainError(
      "INVALID_TIMESTAMP",
      "Resume time cannot be before pause time",
    );
  }
  return {
    ...timer,
    deadlineAt: timer.deadlineAt + (now - timer.pausedAt),
    pausedAt: null,
  };
}

export function remainingTimerMs(
  timer: Readonly<GameTimer>,
  now: number,
): number {
  assertNow(now);
  if (timer.deadlineAt === null) return timer.durationMs;
  if (timer.startedAt !== null && now < timer.startedAt) {
    throw new GameNightDomainError(
      "BACKWARDS_SERVER_TIMESTAMP",
      "Read time cannot be before timer start time",
    );
  }
  const effectiveNow = timer.pausedAt ?? now;
  return Math.max(0, timer.deadlineAt - effectiveNow);
}

export function isTimerExpired(
  timer: Readonly<GameTimer>,
  now: number,
): boolean {
  return (
    timer.startedAt !== null &&
    timer.pausedAt === null &&
    remainingTimerMs(timer, now) === 0
  );
}

function assertRunning(
  timer: Readonly<GameTimer>,
): asserts timer is GameTimer & { startedAt: number; deadlineAt: number } {
  if (
    timer.startedAt === null ||
    timer.deadlineAt === null ||
    timer.pausedAt !== null
  ) {
    throw new GameNightDomainError(
      "TIMER_NOT_RUNNING",
      "Only a running timer can be paused",
    );
  }
}

function assertNow(now: number): void {
  if (!Number.isFinite(now) || now < 0) {
    throw new GameNightDomainError(
      "INVALID_TIMESTAMP",
      "The server timestamp must be a non-negative finite number",
    );
  }
}

function assertDuration(durationMs: number): void {
  if (
    !Number.isSafeInteger(durationMs) ||
    durationMs <= 0
  ) {
    throw new GameNightDomainError(
      "INVALID_TIMER_DURATION",
      "Timer duration must be a positive integer number of milliseconds",
    );
  }
}