import {
  createHmac,
  timingSafeEqual,
  randomBytes,
  scryptSync,
} from "crypto";
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  usersTable,
  membershipsTable,
  type User,
  type Role,
} from "@workspace/db";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ===== password hashing (scrypt) =====

const SCRYPT_N = 16384;
const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N })
    .toString("hex");
  return `s2$${salt}$${hash}`;
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "s2") return false;
  const [, salt, expected] = parts;
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N })
    .toString("hex");
  return safeEqual(actual, expected);
}

// ===== tokens =====

function getSecret(): string {
  const s = process.env["SESSION_SECRET"];
  if (!s) throw new Error("SESSION_SECRET environment variable is required");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Issue a signed, time-limited token bound to a user id. */
export function createToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      uid: userId,
      exp: Date.now() + TOKEN_TTL_MS,
      n: randomBytes(8).toString("hex"),
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Verify a token; returns the user id, or null when invalid/expired. */
export function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!safeEqual(sig, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      uid?: string;
      exp?: number;
    };
    if (typeof data.exp !== "number" || Date.now() > data.exp) return null;
    return typeof data.uid === "string" && data.uid ? data.uid : null;
  } catch {
    return null;
  }
}

// ===== middleware =====

export interface AuthedRequest extends Request {
  user?: User;
}

/** Load and verify the authenticated user; 401 when missing/invalid. */
export async function requireUser(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const userId = verifyToken(token);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.user = user;
  next();
}

/** Require a super admin user. Must run after requireUser. */
export function requireSuperAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user?.isSuperAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

/**
 * Require that the authenticated user is a member of the restaurant in
 * req.params.restaurantId with one of the given roles (super admins always
 * pass). Attaches nothing; handlers read req.params.restaurantId.
 */
export function requireRestaurantRole(...roles: Role[]) {
  return async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const raw = req.params.restaurantId;
    const restaurantId = Array.isArray(raw) ? raw[0] : raw;
    if (!restaurantId) {
      res.status(400).json({ error: "Missing restaurant id" });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.isSuperAdmin) {
      next();
      return;
    }
    const memberships = await db
      .select()
      .from(membershipsTable)
      .where(eq(membershipsTable.userId, req.user.id));
    const match = memberships.find((m) => m.restaurantId === restaurantId);
    if (!match || !roles.includes(match.role as Role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
