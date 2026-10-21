import inventoryTransfersRouter from "./inventoryTransfers";
import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { randomUUID } from "node:crypto";
import { and, eq, or, ilike, asc, desc, count, sql } from "drizzle-orm";
import {
  db,
  invItemsTable,
  invBalancesTable,
  invMovementsTable,
  branchesTable,
  usersTable,
} from "@workspace/db";
import { quantityMilli, stockChange } from "../inventory/stock";
import { literalSearch } from "../inventory/validation";
const router: IRouter = Router();
router.use(inventoryTransfersRouter);
const locationInput = z.object({ branchId: z.uuid().optional() });
async function validBranch(rid: string, branchId: string | null) {
  if (!branchId) return true;
  const [b] = await db
    .select({ id: branchesTable.id })
    .from(branchesTable)
    .where(
      and(eq(branchesTable.id, branchId), eq(branchesTable.restaurantId, rid)),
    );
  return !!b;
}
router.get("/", async (req, res, next) => {
  const q = locationInput
    .extend({
      search: z.string().trim().max(150).default(""),
      offset: z.coerce.number().int().min(0).max(1000000).default(0),
    })
    .safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: "فلاتر الرصيد غير صالحة" });
    return;
  }
  const rid = res.locals.posAccess.restaurantId as string,
    branchId = q.data.branchId || null,
    location = branchId || "none";
  try {
    if (!(await validBranch(rid, branchId))) {
      res.status(400).json({ error: "الفرع غير موجود في هذا المطعم" });
      return;
    }
    const where = and(
      eq(invItemsTable.restaurantId, rid),
      q.data.search
        ? or(
            ilike(invItemsTable.nameAr, literalSearch(q.data.search)),
            ilike(invItemsTable.nameEn, literalSearch(q.data.search)),
            ilike(invItemsTable.code, literalSearch(q.data.search)),
          )
        : undefined,
    );
    const [totals] = await db
      .select({ total: count() })
      .from(invItemsTable)
      .where(where);
    const rows = await db
      .select({
        id: invItemsTable.id,
        code: invItemsTable.code,
        nameAr: invItemsTable.nameAr,
        nameEn: invItemsTable.nameEn,
        unit: invItemsTable.unit,
        isActive: invItemsTable.isActive,
        minimumQuantity: invItemsTable.minimumQuantity,
        quantityMilli:
          sql<number>`coalesce(${invBalancesTable.quantityMilli},0)`.mapWith(
            Number,
          ),
        balanceVersion:
          sql<number>`coalesce(${invBalancesTable.version},0)`.mapWith(Number),
        updatedAt: invBalancesTable.updatedAt,
      })
      .from(invItemsTable)
      .leftJoin(
        invBalancesTable,
        and(
          eq(invBalancesTable.itemId, invItemsTable.id),
          eq(invBalancesTable.restaurantId, rid),
          eq(invBalancesTable.locationKey, location),
        ),
      )
      .where(where)
      .orderBy(asc(invItemsTable.nameAr), asc(invItemsTable.id))
      .limit(50)
      .offset(q.data.offset);
    res
      .set("Cache-Control", "no-store")
      .json({ rows, total: totals.total, offset: q.data.offset, limit: 50 });
  } catch (e) {
    next(e);
  }
});
router.get("/:itemId/movements", async (req, res, next) => {
  const id = z.uuid().safeParse(req.params.itemId),
    q = locationInput.safeParse(req.query),
    rid = res.locals.posAccess.restaurantId as string;
  if (!id.success || !q.success) {
    res.status(400).json({ error: "معرف المادة أو الفرع غير صالح" });
    return;
  }
  try {
    if (!(await validBranch(rid, q.data.branchId || null))) {
      res.status(400).json({ error: "الفرع غير موجود" });
      return;
    }
    const [item] = await db
      .select({ id: invItemsTable.id })
      .from(invItemsTable)
      .where(
        and(eq(invItemsTable.id, id.data), eq(invItemsTable.restaurantId, rid)),
      );
    if (!item) {
      res.status(404).json({ error: "المادة غير موجودة" });
      return;
    }
    const movements = await db
      .select({ movement: invMovementsTable, userName: usersTable.name })
      .from(invMovementsTable)
      .innerJoin(usersTable, eq(usersTable.id, invMovementsTable.createdBy))
      .where(
        and(
          eq(invMovementsTable.restaurantId, rid),
          eq(invMovementsTable.itemId, id.data),
          eq(invMovementsTable.locationKey, q.data.branchId || "none"),
        ),
      )
      .orderBy(desc(invMovementsTable.createdAt), desc(invMovementsTable.id))
      .limit(51);
    res.set("Cache-Control", "no-store").json({
      rows: movements
        .slice(0, 50)
        .map((m) => ({ ...m.movement, userName: m.userName })),
      truncated: movements.length > 50,
    });
  } catch (e) {
    next(e);
  }
});
const movementInput = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  branchId: z.uuid().nullable(),
  kind: z.enum(["receipt", "issue", "waste", "count"]),
  quantity: z.string().max(20),
  reason: z.string().trim().min(3).max(500),
  expectedUnit: z.enum(["g", "kg", "ml", "l", "pcs", "pack"]),
  expectedVersion: z.number().int().min(0).max(2147483646),
});
router.post("/movements", async (req, res, next) => {
  const parsed = movementInput.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "تحقق من المادة والكمية وسبب الحركة (3 أحرف على الأقل)" });
    return;
  }
  const b = parsed.data,
    a = res.locals.posAccess as { restaurantId: string; userId: string };
  let input: number;
  try {
    input = quantityMilli(b.quantity);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [item] = await tx
        .select()
        .from(invItemsTable)
        .where(
          and(
            eq(invItemsTable.id, b.itemId),
            eq(invItemsTable.restaurantId, a.restaurantId),
          ),
        )
        .for("update");
      if (!item) return { status: 404, error: "المادة غير موجودة" };
      const [prior] = await tx
        .select()
        .from(invMovementsTable)
        .where(eq(invMovementsTable.id, b.id));
      if (prior) {
        if (
          prior.restaurantId === a.restaurantId &&
          prior.itemId === b.itemId &&
          prior.branchId === b.branchId &&
          prior.kind === b.kind &&
          prior.unit === b.expectedUnit &&
          prior.inputQuantityMilli === input &&
          prior.reason === b.reason &&
          prior.createdBy === a.userId
        )
          return { status: 200, movement: prior };
        return { status: 409, error: "معرف الحركة مستخدم؛ حدّث السجل" };
      }
      if (item.unit !== b.expectedUnit)
        return {
          status: 409,
          error: "تغيرت وحدة المادة؛ حدّث القائمة وافتح الحركة مجددًا",
        };
      if (!item.isActive)
        return { status: 409, error: "أعد تنشيط المادة قبل تسجيل حركة عليها" };
      if (b.branchId) {
        const [branch] = await tx
          .select({ id: branchesTable.id })
          .from(branchesTable)
          .where(
            and(
              eq(branchesTable.id, b.branchId),
              eq(branchesTable.restaurantId, a.restaurantId),
            ),
          )
          .for("share");
        if (!branch)
          return { status: 400, error: "الفرع غير موجود في هذا المطعم" };
      }
      const location = b.branchId || "none";
      let [balance] = await tx
        .select()
        .from(invBalancesTable)
        .where(
          and(
            eq(invBalancesTable.restaurantId, a.restaurantId),
            eq(invBalancesTable.itemId, b.itemId),
            eq(invBalancesTable.locationKey, location),
          ),
        )
        .for("update");
      if (!balance) {
        if (b.expectedVersion !== 0)
          return {
            status: 409,
            error: "تغير الرصيد؛ حدّث القائمة وافتح الحركة مجددًا",
          };
        [balance] = await tx
          .insert(invBalancesTable)
          .values({
            id: randomUUID(),
            restaurantId: a.restaurantId,
            itemId: b.itemId,
            branchId: b.branchId,
            locationKey: location,
          })
          .returning();
      }
      if (balance.version !== b.expectedVersion)
        return {
          status: 409,
          error: "تغير الرصيد من جهاز آخر؛ حدّث القائمة وافتح الحركة مجددًا",
        };
      const change = stockChange(balance.quantityMilli, b.kind, input);
      const [movement] = await tx
        .insert(invMovementsTable)
        .values({
          id: b.id,
          restaurantId: a.restaurantId,
          itemId: b.itemId,
          branchId: b.branchId,
          locationKey: location,
          kind: b.kind,
          inputQuantityMilli: input,
          ...change,
          unit: item.unit,
          reason: b.reason,
          createdBy: a.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!movement)
        return { status: 409, error: "تعارض في تسجيل الحركة؛ حدّث القائمة" };
      await tx
        .update(invBalancesTable)
        .set({
          quantityMilli: change.afterMilli,
          version: balance.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(invBalancesTable.id, balance.id));
      return { status: 201, movement };
    });
    res
      .status(result.status)
      .set("Cache-Control", "no-store")
      .json(result.error ? { error: result.error } : result.movement);
  } catch (e) {
    if (
      e instanceof Error &&
      [
        "كمية غير صالحة",
        "اختر نوع حركة وكمية موجبة",
        "الرصيد لا يكفي للصرف أو الإتلاف",
        "رصيد المادة يتجاوز مليون وحدة",
      ].includes(e.message)
    ) {
      res.status(400).json({ error: e.message });
      return;
    }
    next(e);
  }
});
export default router;
