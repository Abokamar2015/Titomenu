export const GAME_NIGHT_AUDIT_ACTIONS = [
  "EVENT_CREATED",
  "EVENT_TRANSITIONED",
  "TIMER_STARTED",
  "TIMER_PAUSED",
  "TIMER_RESUMED",
  "SCORE_RECORDED",
  "SCORE_VOIDED",
  "TEMPORARY_SESSION_ISSUED",
  "TEMPORARY_SESSION_REVOKED",
  "PARTICIPANT_JOINED",
  "PARTICIPANT_REMOVED",
] as const;

export type GameNightAuditAction =
  (typeof GAME_NIGHT_AUDIT_ACTIONS)[number];

export type GameNightAuditActorType =
  | "USER"
  | "TEMPORARY_SESSION"
  | "SYSTEM";

export interface GameNightAuditRecord {
  readonly action: GameNightAuditAction;
  readonly actorType: GameNightAuditActorType;
  readonly actorId: string | null;
  readonly eventId: string;
  readonly occurredAt: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}