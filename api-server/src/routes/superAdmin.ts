import { Router, type IRouter, type Response } from "express";
import { z } from "zod/v4";
import { eq, sql } from "drizzle-orm";
import {
  db,
  restaurantsTable,
  usersTable,
  membershipsTable,
  menuItemsTable,
} from "@workspace/db";
import {
  requireUser,
  requireSuperAdmin,
  hashPassword,
  type AuthedRequest,
} from "../lib/auth";

const router: IRouter = Router();

router.use("/sa", requireUser, requireSuperAdmin);

/** GET /sa/restaurants — all restaurants with item counts + owners. */
router.get(
  "/sa/restaurants",
  async (_req: AuthedRequest, res: Response): Promise<void> => {
    const restaurants = await db.select().from(restaurantsTable);
    const counts = await db
      .select({
        restaurantId: menuItemsTable.restaurantId,
        count: sql<number>`count(*)::int`,
      })
      .from(menuItemsTable)
      .groupBy(menuItemsTable.restaurantId);
    const owners = await db
      .select({
        restaurantId: membershipsTable.restaurantId,
        email: usersTable.email,
        role: membershipsTable.role,
      })
      .from(membershipsTable)
      .innerJoin(usersTable, eq(membershipsTable.userId, usersTable.id));
    res.json(
      restaurants.map((r) => ({
        id: r.id,
        slug: r.slug,
        name_ar: r.nameAr,
        name_en: r.nameEn,
        is_active: r.isActive,
        created_at: r.createdAt.toISOString(),
        item_count: counts.find((c) => c.restaurantId === r.id)?.count ?? 0,
        members: owners
          .filter((o) => o.restaurantId === r.id)
          .map((o) => ({ email: o.email, role: o.role })),
      })),
    );
  },
);

const CreateRestaurantBody = z.object({
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, digits, dashes"),
  name_ar: z.string().min(1),
  name_en: z.string().min(1),
  owner_email: z.string().email(),
  owner_password: z.string().min(8),
  owner_name: z.string().optional(),
});

/** POST /sa/restaurants — create a restaurant + owner account. */
router.post(
  "/sa/restaurants",
  async (req: AuthedRequest, res: Response): Promise<void> => {
    const parsed = CreateRestaurantBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const b = parsed.data;
    const email = b.owner_email.trim().toLowerCase();

    const [existingSlug] = await db
      .select()
      .from(restaurantsTable)
      .where(eq(restaurantsTable.slug, b.slug));
    if (existingSlug) {
      res.status(409).json({ error: "Slug already in use" });
      return;
    }

    const [restaurant] = await db
      .insert(restaurantsTable)
      .values({ slug: b.slug, nameAr: b.name_ar, nameEn: b.name_en })
      .returning();

    let [owner] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));
    if (!owner) {
      [owner] = await db
        .insert(usersTable)
        .values({
          email,
          passwordHash: hashPassword(b.owner_password),
          name: b.owner_name ?? "",
        })
        .returning();
    }
    await db.insert(membershipsTable).values({
      userId: owner.id,
      restaurantId: restaurant.id,
      role: "owner",
    });

    res.status(201).json({
      id: restaurant.id,
      slug: restaurant.slug,
      owner_email: owner.email,
    });
  },
);

/** PATCH /sa/restaurants/:id — activate/suspend or rename. */
router.patch(
  "/sa/restaurants/:id",
  async (req: AuthedRequest, res: Response): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const parsed = z
      .object({
        is_active: z.boolean().optional(),
        name_ar: z.string().optional(),
        name_en: z.string().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const set: Record<string, unknown> = {};
    if (parsed.data.is_active !== undefined) set.isActive = parsed.data.is_active;
    if (parsed.data.name_ar !== undefined) set.nameAr = parsed.data.name_ar;
    if (parsed.data.name_en !== undefined) set.nameEn = parsed.data.name_en;
    if (Object.keys(set).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }
    const [row] = await db
      .update(restaurantsTable)
      .set(set)
      .where(eq(restaurantsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Restaurant not found" });
      return;
    }
    res.json({ id: row.id, slug: row.slug, is_active: row.isActive });
  },
);

/** GET /sa/stats — platform statistics. */
router.get(
  "/sa/stats",
  async (_req: AuthedRequest, res: Response): Promise<void> => {
    const result = await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM restaurants) AS restaurants,
        (SELECT count(*)::int FROM restaurants WHERE is_active) AS active_restaurants,
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM branches) AS branches,
        (SELECT count(*)::int FROM menu_items) AS menu_items,
        (SELECT count(*)::int FROM categories) AS categories
    `);
    res.json(result.rows[0]);
  },
);

export default router;
