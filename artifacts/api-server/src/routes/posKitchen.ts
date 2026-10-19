import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, eq, ne, asc, desc, gte } from "drizzle-orm";
import {
  db,
  posOrdersTable,
  posKitchenEventsTable,
  usersTable,
} from "@workspace/db";
import { canAdvanceKitchen } from "../pos/kitchen";
const router: IRouter = Router();
router.get("/kitchen", async (req, res, next) => {
  const a = res.locals.posAccess as { restaurantId: string; userId: string };
  const branch = z.uuid().safeParse(req.query.branchId);
  if (req.query.branchId && !branch.success) {
    res.status(400).json({ error: "الفرع غير صالح" });
    return;
  }
  const tenant = and(
    eq(posOrdersTable.restaurantId, a.restaurantId),
    eq(posOrdersTable.status, "paid"),
    branch.success ? eq(posOrdersTable.branchId, branch.data) : undefined,
  );
  try {
    const [active, completed] = await Promise.all([
      db
        .select()
        .from(posOrdersTable)
        .where(and(tenant, ne(posOrdersTable.kitchenState, "completed")))
        .orderBy(asc(posOrdersTable.createdAt), asc(posOrdersTable.id))
        .limit(101),
      db
        .select()
        .from(posOrdersTable)
        .where(
          and(
            tenant,
            eq(posOrdersTable.kitchenState, "completed"),
            gte(
              posOrdersTable.kitchenChangedAt,
              new Date(Date.now() - 86400000),
            ),
          ),
        )
        .orderBy(desc(posOrdersTable.kitchenChangedAt))
        .limit(101),
    ]);
    res
      .set("Cache-Control", "no-store")
      .json({
        active: active.slice(0, 100),
        completed: completed.slice(0, 100),
        activeTruncated: active.length > 100,
        completedTruncated: completed.length > 100,
        serverTime: new Date().toISOString(),
      });
  } catch (e) {
    next(e);
  }
});
router.get("/orders/:orderId/kitchen-history", async (req, res, next) => {
  const a = res.locals.posAccess as { restaurantId: string };
  const id = z.uuid().safeParse(req.params.orderId);
  if (!id.success) {
    res.status(400).json({ error: "معرف الطلب غير صالح" });
    return;
  }
  try {
    const [order] = await db
      .select({ id: posOrdersTable.id })
      .from(posOrdersTable)
      .where(
        and(
          eq(posOrdersTable.id, id.data),
          eq(posOrdersTable.restaurantId, a.restaurantId),
        ),
      );
    if (!order) {
      res.status(404).json({ error: "الطلب غير موجود" });
      return;
    }
    const events = await db
      .select({
        id: posKitchenEventsTable.id,
        fromState: posKitchenEventsTable.fromState,
        toState: posKitchenEventsTable.toState,
        createdAt: posKitchenEventsTable.createdAt,
        userName: usersTable.name,
      })
      .from(posKitchenEventsTable)
      .innerJoin(usersTable, eq(usersTable.id, posKitchenEventsTable.createdBy))
      .where(
        and(
          eq(posKitchenEventsTable.orderId, id.data),
          eq(posKitchenEventsTable.restaurantId, a.restaurantId),
        ),
      )
      .orderBy(asc(posKitchenEventsTable.createdAt));
    res.set("Cache-Control", "no-store").json({ events });
  } catch (e) {
    next(e);
  }
});
router.post("/orders/:orderId/kitchen-state", async (req, res, next) => {
  const a = res.locals.posAccess as { restaurantId: string; userId: string };
  const id = z.uuid().safeParse(req.params.orderId),
    input = z
      .object({
        requestId: z.uuid(),
        expected: z.enum(["new", "preparing", "ready"]),
        next: z.enum(["preparing", "ready", "completed"]),
      })
      .safeParse(req.body);
  if (!id.success || !input.success) {
    res.status(400).json({ error: "بيانات حالة التحضير غير صالحة" });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(posOrdersTable)
        .where(
          and(
            eq(posOrdersTable.id, id.data),
            eq(posOrdersTable.restaurantId, a.restaurantId),
          ),
        )
        .for("update");
      if (!order) return { status: 404, error: "الطلب غير موجود" };
      const b = input.data;
      const [prior] = await tx
        .select()
        .from(posKitchenEventsTable)
        .where(eq(posKitchenEventsTable.id, b.requestId));
      if (prior) {
        if (
          prior.restaurantId !== a.restaurantId ||
          prior.orderId !== id.data ||
          prior.createdBy !== a.userId ||
          prior.fromState !== b.expected ||
          prior.toState !== b.next
        )
          return { status: 409, error: "معرف التحديث مستخدم" };
        return { status: 200, order };
      }
      if (
        !canAdvanceKitchen(order.status, order.kitchenState, b.expected, b.next)
      )
        return {
          status: 409,
          error: "تغيرت حالة الطلب أو أُلغي؛ حدّث الشاشة قبل المتابعة",
        };
      const [event] = await tx
        .insert(posKitchenEventsTable)
        .values({
          id: b.requestId,
          restaurantId: a.restaurantId,
          orderId: id.data,
          createdBy: a.userId,
          fromState: b.expected,
          toState: b.next,
        })
        .onConflictDoNothing()
        .returning();
      if (!event)
        return { status: 409, error: "تعارض في التحديث؛ أعد تحميل الطلب" };
      const [updated] = await tx
        .update(posOrdersTable)
        .set({ kitchenState: b.next, kitchenChangedAt: new Date() })
        .where(eq(posOrdersTable.id, id.data))
        .returning();
      return { status: 200, order: updated };
    });
    res
      .status(result.status)
      .set("Cache-Control", "no-store")
      .json(result.error ? { error: result.error } : result.order);
  } catch (e) {
    next(e);
  }
});
export default router;
