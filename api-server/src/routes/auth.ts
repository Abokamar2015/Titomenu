import { Router, type IRouter, type Response } from "express";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import {
  db,
  usersTable,
  membershipsTable,
  restaurantsTable,
} from "@workspace/db";
import {
  createToken,
  verifyPasswordHash,
  hashPassword,
  requireUser,
  type AuthedRequest,
} from "../lib/auth";

const router: IRouter = Router();

const LoginBody = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

async function getMembershipsPayload(userId: string) {
  const rows = await db
    .select({
      restaurantId: membershipsTable.restaurantId,
      role: membershipsTable.role,
      slug: restaurantsTable.slug,
      nameAr: restaurantsTable.nameAr,
      nameEn: restaurantsTable.nameEn,
      isActive: restaurantsTable.isActive,
    })
    .from(membershipsTable)
    .innerJoin(
      restaurantsTable,
      eq(membershipsTable.restaurantId, restaurantsTable.id),
    )
    .where(eq(membershipsTable.userId, userId));
  return rows.map((r) => ({
    restaurant_id: r.restaurantId,
    role: r.role,
    slug: r.slug,
    name_ar: r.nameAr,
    name_en: r.nameEn,
    is_active: r.isActive,
  }));
}

function userToApi(u: {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  avatarUrl?: string | null;
  createdAt?: Date | null;
  lastLoginAt?: Date | null;
}) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    is_super_admin: u.isSuperAdmin,
    avatar_url: u.avatarUrl ?? null,
    created_at: u.createdAt ? u.createdAt.toISOString() : null,
    last_login_at: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
  };
}

/** POST /auth/login — email + password -> token + user + memberships. */
router.post("/auth/login", async (req, res: Response): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));
  if (!user || !verifyPasswordHash(parsed.data.password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const now = new Date();
  await db
    .update(usersTable)
    .set({ lastLoginAt: now })
    .where(eq(usersTable.id, user.id));
  res.json({
    token: createToken(user.id),
    user: userToApi({ ...user, lastLoginAt: now }),
    memberships: await getMembershipsPayload(user.id),
  });
});

/** PATCH /auth/me — update own profile (name, email, avatar). */
router.patch(
  "/auth/me",
  requireUser,
  async (req: AuthedRequest, res: Response): Promise<void> => {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
        current_password: z.string().optional(),
        avatar_url: z
          .string()
          .max(500)
          .refine((v) => v === "" || v.startsWith("/api/storage/objects/"), {
            message: "Invalid avatar URL",
          })
          .optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid profile data" });
      return;
    }
    const user = req.user!;
    const { name, email, avatar_url, current_password } = parsed.data;
    if (name === undefined && email === undefined && avatar_url === undefined) {
      res.status(400).json({ error: "Invalid profile data" });
      return;
    }
    if (email && email !== user.email) {
      // Changing the login email is sensitive — require re-authentication.
      if (
        !current_password ||
        !verifyPasswordHash(current_password, user.passwordHash)
      ) {
        res
          .status(403)
          .json({ error: "Current password required to change email" });
        return;
      }
      const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, email));
      if (existing && existing.id !== user.id) {
        res.status(409).json({ error: "Email already in use" });
        return;
      }
    }
    const updates: Partial<{
      name: string;
      email: string;
      avatarUrl: string | null;
    }> = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (avatar_url !== undefined) updates.avatarUrl = avatar_url || null;
    try {
      const [updated] = await db
        .update(usersTable)
        .set(updates)
        .where(eq(usersTable.id, user.id))
        .returning();
      res.json({ user: userToApi(updated) });
    } catch (err) {
      // Map unique-constraint races on email to the documented 409.
      const code = (err as { code?: string }).code;
      if (code === "23505") {
        res.status(409).json({ error: "Email already in use" });
        return;
      }
      throw err;
    }
  },
);

/** GET /auth/me — current user + memberships. */
router.get(
  "/auth/me",
  requireUser,
  async (req: AuthedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    res.json({
      user: userToApi(user),
      memberships: await getMembershipsPayload(user.id),
    });
  },
);

/** POST /auth/change-password */
router.post(
  "/auth/change-password",
  requireUser,
  async (req: AuthedRequest, res: Response): Promise<void> => {
    const parsed = z
      .object({
        current_password: z.string().min(1),
        new_password: z.string().min(8),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "New password must be at least 8 characters" });
      return;
    }
    const user = req.user!;
    if (!verifyPasswordHash(parsed.data.current_password, user.passwordHash)) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }
    await db
      .update(usersTable)
      .set({ passwordHash: hashPassword(parsed.data.new_password) })
      .where(eq(usersTable.id, user.id));
    res.sendStatus(204);
  },
);

/** GET /auth/verify — kept for backward compatibility. */
router.get(
  "/auth/verify",
  requireUser,
  (_req: AuthedRequest, res: Response): void => {
    res.json({ ok: true });
  },
);

export default router;
