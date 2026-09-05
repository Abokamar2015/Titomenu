import { GameNightDomainError } from "./errors.js";

export interface ScoreRule {
  readonly action: string;
  readonly pointsDelta: number;
  readonly minimumQuantity?: number;
  readonly maximumQuantity?: number;
}

export interface ScoreCommand {
  readonly teamId: string;
  readonly action: string;
  readonly reason: string;
  readonly quantity: number;
  readonly idempotencyKey: string;
}

export interface ScoreLedgerEntry extends ScoreCommand {
  readonly id: string;
  readonly pointsDelta: number;
  readonly createdAt: number;
}

const COMMAND_KEYS = new Set([
  "teamId",
  "action",
  "reason",
  "quantity",
  "idempotencyKey",
]);

/**
 * Validates an untrusted score command. In particular, points is deliberately
 * not a command field: the server derives it from its configured rule.
 */
export function validateScoreCommand(input: unknown): ScoreCommand {
  if (!isRecord(input)) {
    throw invalidCommand("Score command must be an object");
  }
  for (const key of Object.keys(input)) {
    if (!COMMAND_KEYS.has(key)) {
      throw invalidCommand(`Unexpected score command field: ${key}`);
    }
  }

  const teamId = requiredText(input["teamId"], "teamId");
  const action = requiredText(input["action"], "action");
  const reason = requiredText(input["reason"], "reason", 500);
  const quantity = input["quantity"];
  if (
    typeof quantity !== "number" ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0
  ) {
    throw invalidCommand("quantity must be a positive integer");
  }
  const idempotencyKey = requiredText(input["idempotencyKey"], "idempotencyKey", 200);
  return {
    teamId,
    action,
    reason,
    quantity,
    idempotencyKey,
  };
}

export function calculatePointsDelta(
  command: Readonly<ScoreCommand>,
  rules: readonly ScoreRule[],
): number {
  const rule = rules.find((candidate) => candidate.action === command.action);
  if (!rule) {
    throw new GameNightDomainError(
      "UNKNOWN_SCORE_ACTION",
      `No scoring rule exists for action ${command.action}`,
    );
  }
  if (!Number.isSafeInteger(rule.pointsDelta)) {
    throw new GameNightDomainError(
      "INVALID_SCORE_RULE",
      `Points delta for action ${rule.action} must be an integer`,
    );
  }
  const minimum = rule.minimumQuantity ?? 1;
  const maximum = rule.maximumQuantity ?? Number.MAX_SAFE_INTEGER;
  if (
    !Number.isSafeInteger(command.quantity) ||
    command.quantity < minimum ||
    command.quantity > maximum
  ) {
    throw new GameNightDomainError(
      "SCORE_QUANTITY_OUT_OF_RANGE",
      `Quantity for action ${rule.action} must be between ${minimum} and ${maximum}`,
    );
  }
  const pointsDelta = rule.pointsDelta * command.quantity;
  if (!Number.isSafeInteger(pointsDelta)) {
    throw new GameNightDomainError(
      "SCORE_OVERFLOW",
      "Calculated points exceed the safe integer range",
    );
  }
  return pointsDelta;
}

export function createScoreLedgerEntry(
  id: string,
  input: unknown,
  rules: readonly ScoreRule[],
  now: number,
): ScoreLedgerEntry {
  const entryId = requiredText(id, "id");
  if (!Number.isFinite(now) || now < 0) {
    throw new GameNightDomainError(
      "INVALID_TIMESTAMP",
      "The server timestamp must be a non-negative finite number",
    );
  }
  const command = validateScoreCommand(input);
  return {
    id: entryId,
    ...command,
    pointsDelta: calculatePointsDelta(command, rules),
    createdAt: now,
  };
}

export function totalLedgerPoints(
  entries: readonly Pick<ScoreLedgerEntry, "pointsDelta">[],
): number {
  return entries.reduce((total, entry) => {
    if (!Number.isSafeInteger(entry.pointsDelta)) {
      throw new GameNightDomainError(
        "INVALID_LEDGER_ENTRY",
        "Ledger points delta must be an integer",
      );
    }
    const next = total + entry.pointsDelta;
    if (!Number.isSafeInteger(next)) {
      throw new GameNightDomainError(
        "SCORE_OVERFLOW",
        "Ledger total exceeds the safe integer range",
      );
    }
    return next;
  }, 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string, maxLength = 200): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    throw invalidCommand(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function invalidCommand(message: string): GameNightDomainError {
  return new GameNightDomainError("INVALID_SCORE_COMMAND", message);
}