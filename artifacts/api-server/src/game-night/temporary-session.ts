import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { GameNightDomainError } from "./errors.js";

export const DEFAULT_TEMPORARY_SESSION_TTL_MS = 4 * 60 * 60 * 1000;

export interface IssuedTemporarySession {
  /** The only copy of the bearer credential; return it to the client once. */
  readonly token: string;
  /** Persist this digest rather than the bearer credential. */
  readonly tokenHash: string;
  readonly expiresAt: number;
}

export interface StoredTemporarySession {
  readonly tokenHash: string;
  readonly expiresAt: number;
  readonly revokedAt?: number | null;
}

export function hashTemporarySessionToken(token: string): string {
  if (typeof token !== "string" || token.length === 0) {
    throw new GameNightDomainError(
      "INVALID_TEMPORARY_SESSION_TOKEN",
      "Temporary-session token must be a non-empty string",
    );
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function issueTemporarySession(
  now: number,
  ttlMs = DEFAULT_TEMPORARY_SESSION_TTL_MS,
): IssuedTemporarySession {
  assertTimestamp(now);
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new GameNightDomainError(
      "INVALID_SESSION_TTL",
      "Temporary-session lifetime must be a positive integer",
    );
  }
  const expiresAt = now + ttlMs;
  if (!Number.isSafeInteger(expiresAt)) {
    throw new GameNightDomainError(
      "INVALID_SESSION_TTL",
      "Temporary-session expiry exceeds the safe integer range",
    );
  }
  const token = `gns_${randomBytes(32).toString("base64url")}`;
  return {
    token,
    tokenHash: hashTemporarySessionToken(token),
    expiresAt,
  };
}

export function verifyTemporarySessionToken(
  token: string | undefined,
  session: Readonly<StoredTemporarySession>,
  now: number,
): boolean {
  assertTimestamp(now);
  if (
    !token ||
    !Number.isFinite(session.expiresAt) ||
    now >= session.expiresAt ||
    (session.revokedAt !== undefined && session.revokedAt !== null)
  ) {
    return false;
  }

  const actual = Buffer.from(hashTemporarySessionToken(token), "hex");
  let expected: Buffer;
  try {
    expected = Buffer.from(session.tokenHash, "hex");
  } catch {
    return false;
  }
  return (
    expected.length === actual.length &&
    expected.length === 32 &&
    timingSafeEqual(actual, expected)
  );
}

function assertTimestamp(now: number): void {
  if (!Number.isFinite(now) || now < 0) {
    throw new GameNightDomainError(
      "INVALID_TIMESTAMP",
      "The server timestamp must be a non-negative finite number",
    );
  }
}