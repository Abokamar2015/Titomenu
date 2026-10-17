import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { eq, and, asc } from "drizzle-orm";
import {
  db,
  menuItemsTable,
  categoriesTable,
  settingsTable,
  restaurantsTable,
  type MenuItem,
  type Category,
} from "@workspace/db";
import {
  requireUser,
  requireRestaurantRole,
  type AuthedRequest,
} from "../lib/auth";

const router: IRouter = Router();

export function getDefaultSlug(): string {
  return process.env.DEFAULT_RESTAURANT_SLUG?.trim() || "and-co";
}

function paramStr(raw: string | string[]): string {
  return Array.isArray(raw) ? raw[0] : raw;
}

// ===== mappers (DB camelCase <-> API snake_case) =====
function itemToApi(row: MenuItem) {
  return {
    id: row.id,
    name_ar: row.nameAr,
    name_en: row.nameEn,
    description_ar: row.descriptionAr,
    description_en: row.descriptionEn,
    price: row.price,
    calories: row.calories,
    category: row.category,
    is_available: row.isAvailable,
    sort_order: row.sortOrder,
    image_url: row.imageUrl,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function catToApi(row: Category) {
  return {
    key: row.key,
    name_ar: row.nameAr,
    name_en: row.nameEn,
    icon: row.icon,
    sort_order: row.sortOrder,
    is_active: row.isActive,
    image_url: row.imageUrl,
  };
}

// ===== schemas =====
const itemInsert = z.object({
  name_ar: z.string(),
  name_en: z.string(),
  description_ar: z.string().optional(),
  description_en: z.string().optional(),
  price: z.number().int(),
  calories: z.number().int().nullable().optional(),
  category: z.string(),
  is_available: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  image_url: z.string().nullable().optional(),
});
const itemUpdate = itemInsert.partial();

type ItemInsert = z.infer<typeof itemInsert>;
type ItemUpdate = z.infer<typeof itemUpdate>;

function itemToDb(b: ItemInsert | ItemUpdate) {
  const out: Record<string, unknown> = {};
  if (b.name_ar !== undefined) out.nameAr = b.name_ar;
  if (b.name_en !== undefined) out.nameEn = b.name_en;
  if (b.description_ar !== undefined) out.descriptionAr = b.description_ar;
  if (b.description_en !== undefined) out.descriptionEn = b.description_en;
  if (b.price !== undefined) out.price = b.price;
  if (b.calories !== undefined) out.calories = b.calories;
  if (b.category !== undefined) out.category = b.category;
  if (b.is_available !== undefined) out.isAvailable = b.is_available;
  if (b.sort_order !== undefined) out.sortOrder = b.sort_order;
  if (b.image_url !== undefined) out.imageUrl = b.image_url;
  return out;
}

const catInsert = z.object({
  key: z.string().min(1),
  name_ar: z.string(),
  name_en: z.string(),
  icon: z.string().optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
  image_url: z.string().nullable().optional(),
});
const catUpdate = catInsert.partial();

type CatInsert = z.infer<typeof catInsert>;
type CatUpdate = z.infer<typeof catUpdate>;

function catToDb(b: CatInsert | CatUpdate) {
  const out: Record<string, unknown> = {};
  if (b.key !== undefined) out.key = b.key;
  if (b.name_ar !== undefined) out.nameAr = b.name_ar;
  if (b.name_en !== undefined) out.nameEn = b.name_en;
  if (b.icon !== undefined) out.icon = b.icon;
  if (b.sort_order !== undefined) out.sortOrder = b.sort_order;
  if (b.is_active !== undefined) out.isActive = b.is_active;
  if (b.image_url !== undefined) out.imageUrl = b.image_url;
  return out;
}

// ===== shared read handlers (scoped to a restaurant id) =====
async function listItems(restaurantId: string, onlyAvailable: boolean) {
  const rows = await db
    .select()
    .from(menuItemsTable)
    .where(eq(menuItemsTable.restaurantId, restaurantId))
    .orderBy(asc(menuItemsTable.category), asc(menuItemsTable.sortOrder));
  return (onlyAvailable ? rows.filter((r) => r.isAvailable) : rows).map(
    itemToApi,
  );
}

async function listCategories(restaurantId: string) {
  const rows = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.restaurantId, restaurantId))
    .orderBy(asc(categoriesTable.sortOrder));
  return rows.map(catToApi);
}

async function listSettings(restaurantId: string) {
  const rows = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.restaurantId, restaurantId));
  return rows.map((r) => ({ key: r.key, value: r.value }));
}

async function findActiveRestaurantBySlug(slug: string) {
  const [r] = await db
    .select()
    .from(restaurantsTable)
    .where(
      and(eq(restaurantsTable.slug, slug), eq(restaurantsTable.isActive, true)),
    );
  return r;
}

// =====================================================================
// PUBLIC routes (no auth): /public/:slug/...
// =====================================================================
router.get("/public/:slug/restaurant", async (req, res): Promise<void> => {
  const r = await findActiveRestaurantBySlug(paramStr(req.params.slug));
  if (!r) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }
  res.json({ id: r.id, slug: r.slug, name_ar: r.nameAr, name_en: r.nameEn });
});

router.get("/public/:slug/items", async (req, res): Promise<void> => {
  const r = await findActiveRestaurantBySlug(paramStr(req.params.slug));
  if (!r) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }
  res.json(await listItems(r.id, req.query.available === "true"));
});

router.get("/public/:slug/categories", async (req, res): Promise<void> => {
  const r = await findActiveRestaurantBySlug(paramStr(req.params.slug));
  if (!r) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }
  res.json(await listCategories(r.id));
});

router.get("/public/:slug/settings", async (req, res): Promise<void> => {
  const r = await findActiveRestaurantBySlug(paramStr(req.params.slug));
  if (!r) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }
  res.json(await listSettings(r.id));
});

// =====================================================================
// LEGACY public routes — serve the default restaurant so existing QR
// codes and old clients keep working: /menu/items, /menu/categories,
// /menu/settings (read-only).
// =====================================================================
async function defaultRestaurantId(res: Response): Promise<string | null> {
  const r = await findActiveRestaurantBySlug(getDefaultSlug());
  if (!r) {
    res.status(404).json({ error: "Default restaurant not found" });
    return null;
  }
  return r.id;
}

router.get("/menu/items", async (req, res): Promise<void> => {
  const rid = await defaultRestaurantId(res);
  if (!rid) return;
  res.json(await listItems(rid, req.query.available === "true"));
});

router.get("/menu/categories", async (_req, res): Promise<void> => {
  const rid = await defaultRestaurantId(res);
  if (!rid) return;
  res.json(await listCategories(rid));
});

router.get("/menu/settings", async (_req, res): Promise<void> => {
  const rid = await defaultRestaurantId(res);
  if (!rid) return;
  res.json(await listSettings(rid));
});

// =====================================================================
// TENANT ADMIN routes: /restaurants/:restaurantId/menu/...
// Menu writes: owner, manager, staff. Settings writes: owner, manager.
// =====================================================================
const canEditMenu = [
  requireUser,
  requireRestaurantRole("owner", "manager", "staff"),
] as const;
const canEditSettings = [
  requireUser,
  requireRestaurantRole("owner", "manager"),
] as const;

function rid(req: Request): string {
  return paramStr(req.params.restaurantId);
}

// ----- items -----
router.get(
  "/restaurants/:restaurantId/menu/items",
  ...canEditMenu,
  async (req: AuthedRequest, res): Promise<void> => {
    res.json(await listItems(rid(req), req.query.available === "true"));
  },
);

router.post(
  "/restaurants/:restaurantId/menu/items",
  ...canEditMenu,
  async (req: AuthedRequest, res): Promise<void> => {
    const parsed = itemInsert.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [row] = await db
      .insert(menuItemsTable)
      .values({
        ...(itemToDb(parsed.data) as typeof menuItemsTable.$inferInsert),
        restaurantId: rid(req),
      })
      .returning();
    res.status(201).json(itemToApi(row));
  },
);

// NOTE: must stay before /menu/items/:id
router.patch(
  "/restaurants/:restaurantId/menu/items/sort-orders",
  ...canEditMenu,
  async (req: AuthedRequest, res): Promise<void> => {
    const schema = z.object({
      updates: z.array(
        z.object({ id: z.string(), sort_order: z.number().int() }),
      ),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    await Promise.all(
      parsed.data.updates.map(({ id, sort_order }) =>
        db
          .update(menuItemsTable)
          .set({ sortOrder: sort_order })
          .where(
            and(
              eq(menuItemsTable.id, id),
              eq(menuItemsTable.restaurantId, rid(req)),
            ),
          ),
      ),
    );
    res.sendStatus(204);
  },
);

router.patch(
  "/restaurants/:restaurantId/menu/items/:id",
  ...canEditMenu,
  async (req: AuthedRequest, res): Promise<void> => {
    const id = paramStr(req.params.id);
    const parsed = itemUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [row] = await db
      .update(menuItemsTable)
      .set(itemToDb(parsed.data))
      .where(
        and(
          eq(menuItemsTable.id, id),
          eq(menuItemsTable.restaurantId, rid(req)),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    res.json(itemToApi(row));
  },
);

router.delete(
  "/restaurants/:restaurantId/menu/items/:id",
  ...canEditMenu,
  async (req: AuthedRequest, res): Promise<void> => {
    const id = paramStr(req.params.id);
    await db
      .delete(menuItemsTable)
      .where(
        and(
          eq(menuItemsTable.id, id),
          eq(menuItemsTable.restaurantId, rid(req)),
        ),
      );
    res.sendStatus(204);
  },
);

// ----- categories -----
router.get(
  "/restaurants/:restaurantId/menu/categories",
  ...canEditMenu,
  async (req: AuthedRequest, res): Promise<void> => {
    res.json(await listCategories(rid(req)));
  },
);

router.post(
  "/restaurants/:restaurantId/menu/categories",
  ...canEditMenu,
  async (req: AuthedRequest, res): Promise<void> => {
    const parsed = catInsert.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [row] = await db
      .insert(categoriesTable)
      .values({
        ...(catToDb(parsed.data) as typeof categoriesTable.$inferInsert),
        restaurantId: rid(req),
      })
      .returning();
    res.status(201).json(catToApi(row));
  },
);

router.patch(
  "/restaurants/:restaurantId/menu/categories/:key",
  ...canEditMenu,
  async (req: AuthedRequest, res): Promise<void> => {
    const key = paramStr(req.params.key);
    const parsed = catUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [row] = await db
      .update(categoriesTable)
      .set(catToDb(parsed.data))
      .where(
        and(
          eq(categoriesTable.key, key),
          eq(categoriesTable.restaurantId, rid(req)),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    res.json(catToApi(row));
  },
);

router.delete(
  "/restaurants/:restaurantId/menu/categories/:key",
  ...canEditMenu,
  async (req: AuthedRequest, res): Promise<void> => {
    const key = paramStr(req.params.key);
    await db
      .delete(categoriesTable)
      .where(
        and(
          eq(categoriesTable.key, key),
          eq(categoriesTable.restaurantId, rid(req)),
        ),
      );
    res.sendStatus(204);
  },
);

// ----- settings -----
router.get(
  "/restaurants/:restaurantId/menu/settings",
  ...canEditMenu,
  async (req: AuthedRequest, res): Promise<void> => {
    res.json(await listSettings(rid(req)));
  },
);

router.put(
  "/restaurants/:restaurantId/menu/settings/:key",
  ...canEditSettings,
  async (req: AuthedRequest, res): Promise<void> => {
    const key = paramStr(req.params.key);
    const parsed = z.object({ value: z.string() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    await db
      .insert(settingsTable)
      .values({ restaurantId: rid(req), key, value: parsed.data.value })
      .onConflictDoUpdate({
        target: [settingsTable.restaurantId, settingsTable.key],
        set: { value: parsed.data.value },
      });
    res.sendStatus(204);
  },
);

export default router;
